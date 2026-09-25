public import Foundation
import Security

/// Stores connection passwords. The keychain implementation is used by the app; the
/// in-memory one by tests and previews.
public protocol PasswordStore: Sendable {
    func password(for profileID: UUID) throws -> String?
    func setPassword(_ password: String?, for profileID: UUID) throws
}

public struct KeychainError: Error, LocalizedError, Equatable {
    public var status: OSStatus

    public var errorDescription: String? {
        let message = SecCopyErrorMessageString(status, nil) as String? ?? "Keychain error \(status)"
        return "Keychain: \(message)"
    }
}

/// Generic-password keychain items keyed by profile identifier.
public struct KeychainPasswordStore: PasswordStore {
    public let service: String

    public init(service: String = StorageLocations.bundleIdentifier) {
        self.service = service
    }

    public func password(for profileID: UUID) throws -> String? {
        var query = baseQuery(profileID)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data else { return nil }
            return String(decoding: data, as: UTF8.self)
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainError(status: status)
        }
    }

    public func setPassword(_ password: String?, for profileID: UUID) throws {
        let query = baseQuery(profileID)
        guard let password else {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError(status: status) }
            return
        }
        let data = Data(password.utf8)
        let update: [String: Any] = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if updateStatus == errSecItemNotFound {
            var insert = query
            insert[kSecValueData as String] = data
            let addStatus = SecItemAdd(insert as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw KeychainError(status: addStatus) }
        } else if updateStatus != errSecSuccess {
            throw KeychainError(status: updateStatus)
        }
    }

    private func baseQuery(_ profileID: UUID) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: profileID.uuidString,
        ]
    }
}

/// Non-persistent store for tests and SwiftUI previews.
public final class InMemoryPasswordStore: PasswordStore, @unchecked Sendable {
    private let lock = NSLock()
    private var passwords: [UUID: String] = [:]

    public init() {}

    public func password(for profileID: UUID) throws -> String? {
        lock.withLock { passwords[profileID] }
    }

    public func setPassword(_ password: String?, for profileID: UUID) throws {
        lock.withLock { passwords[profileID] = password }
    }
}
