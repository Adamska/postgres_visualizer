import Foundation
import TableCore
import Testing
@testable import TablePlusPlus

@MainActor
@Suite("App model")
struct AppModelTests {
    private func makeModel(database: MockDatabase = .sample) -> AppModel {
        AppModel(environment: .preview(driver: MockDriver(database: database)))
    }

    @Test("Saves, connects and manages tabs")
    func tabs() async {
        let model = makeModel()
        let profile = ConnectionProfile(name: "Mock")
        await model.saveProfile(profile, password: "secret")
        #expect(model.profiles.map(\.name) == ["Mock"])
        #expect(model.password(for: profile.id) == "secret")

        let connection = await model.connect(profile)
        #expect(connection.isConnected)
        #expect(model.connections.count == 1)
        #expect(model.closedProfiles.isEmpty)

        let first = model.openTable(MockDatabase.users, on: connection)
        let again = model.openTable(MockDatabase.users, on: connection)
        #expect(first.id == again.id)
        let filtered = model.openTable(MockDatabase.users, on: connection, filters: [Filter(column: "id", value: "1")])
        #expect(filtered.id != first.id)
        let query = model.newQueryTab(sql: "select 1")
        #expect(model.tabs.count == 3)
        #expect(model.selectedTabID == query?.id)
        #expect(model.selectedTab?.title == "select 1")

        model.selectTab(offset: 1)
        #expect(model.selectedTabID == first.id)
        model.selectTab(number: 2)
        #expect(model.selectedTabID == filtered.id)
        await model.closeTab(id: filtered.id)
        #expect(model.tabs.count == 2)
        #expect(model.selectedTabID == query?.id)

        await model.disconnect(connection)
        #expect(model.tabs.isEmpty)
        #expect(model.connections.isEmpty)
        #expect(model.closedProfiles.count == 1)
    }

    @Test("Connection failures are reported and not kept open")
    func connectionFailure() async {
        var database = MockDatabase.sample
        database.connectionFailure = DatabaseError(category: .authentication, message: "password authentication failed")
        let model = makeModel(database: database)
        let profile = ConnectionProfile(name: "Broken")
        await model.saveProfile(profile, password: nil)
        await model.connect(profile)
        #expect(model.connections.isEmpty)
        #expect(model.presentedError?.message == "password authentication failed")
    }

    @Test("Workspace is restored on start")
    func restore() async {
        let environment = AppEnvironment.preview()
        let profile = ConnectionProfile(name: "Mock")
        let model = AppModel(environment: environment)
        await model.saveProfile(profile, password: nil)
        let connection = await model.connect(profile)
        model.openTable(MockDatabase.users, on: connection)
        _ = model.newQueryTab(sql: "select 42", title: "Answer")
        model.openStructure(MockDatabase.users, on: connection)
        model.persistWorkspace()
        try? await Task.sleep(for: .milliseconds(100))

        UserDefaults.standard.set(true, forKey: PreferenceKey.restoreWorkspace)
        let restored = AppModel(environment: environment)
        await restored.start()
        #expect(restored.isReady)
        #expect(restored.connections.count == 1)
        #expect(restored.tabs.map(\.title) == ["users", "Answer", "users"])
        #expect(restored.tabs[1].queryModel?.text == "select 42")
        #expect(restored.selectedTab?.title == "users")
        #expect(restored.tabs[2].systemImage == "list.bullet.rectangle")
    }
}

@Suite("Grid content builder")
struct GridContentBuilderTests {
    @Test("Formats cells for display")
    func formatting() {
        let result = MockDatabase.sample.defaultResult
        let rows = GridContentBuilder.rows(for: result)
        #expect(rows[1].cells[3].text == "NULL" && rows[1].cells[3].isNull)
        #expect(rows[0].cells[3].text == "{\"theme\": \"dark\"}")
        let columns = GridContentBuilder.columns(for: result, structure: nil)
        #expect(columns.allSatisfy { !$0.isEditable })
    }

    @Test("Value formatting helpers")
    func helpers() {
        #expect(ValueFormatting.gridText(for: .text("a\nb"), kind: .text) == "a⏎ b")
        #expect(ValueFormatting.gridText(for: .text(String(repeating: "x", count: 400)), kind: .text).count == 301)
        #expect(ValueFormatting.detailText(for: .text("{\"b\":1,\"a\":[1]}"), kind: .json) == "{\n  \"a\" : [\n    1\n  ],\n  \"b\" : 1\n}")
        #expect(ValueFormatting.rowCount(1) == "1 row")
        #expect(ValueFormatting.rowCount(12_345, estimated: true) == "~12,345 rows")
        #expect(ValueFormatting.duration(.milliseconds(1_500)) == "1.50 s")
    }
}
