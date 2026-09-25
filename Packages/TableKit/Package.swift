// swift-tools-version: 6.2

import PackageDescription

let strictSettings: [SwiftSetting] = [
    .treatAllWarnings(as: .error),
    .enableUpcomingFeature("ExistentialAny"),
    .enableUpcomingFeature("InternalImportsByDefault"),
]

let package = Package(
    name: "TableKit",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "TableCore", targets: ["TableCore"]),
        .library(name: "TablePostgres", targets: ["TablePostgres"]),
        .library(name: "TableStorage", targets: ["TableStorage"]),
    ],
    dependencies: [
        .package(url: "https://github.com/vapor/postgres-nio.git", from: "1.22.0"),
    ],
    targets: [
        .target(
            name: "TableCore",
            swiftSettings: strictSettings
        ),
        .target(
            name: "TablePostgres",
            dependencies: [
                "TableCore",
                .product(name: "PostgresNIO", package: "postgres-nio"),
            ],
            swiftSettings: strictSettings
        ),
        .target(
            name: "TableStorage",
            dependencies: ["TableCore"],
            swiftSettings: strictSettings
        ),
        .testTarget(
            name: "TableCoreTests",
            dependencies: ["TableCore"],
            swiftSettings: strictSettings
        ),
        .testTarget(
            name: "TablePostgresTests",
            dependencies: ["TablePostgres"],
            swiftSettings: strictSettings
        ),
        .testTarget(
            name: "TableStorageTests",
            dependencies: ["TableStorage"],
            swiftSettings: strictSettings
        ),
    ]
)
