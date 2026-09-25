import AppKit
import Foundation
import TableCore
import Testing
@testable import TablePlusPlus

@MainActor
@Suite struct DataGridTests {
    // MARK: Widths

    @Test func defaultWidthDependsOnKind() {
        #expect(DataGridStyle.defaultWidth(for: .boolean) == 90)
        #expect(DataGridStyle.defaultWidth(for: .integer) == 90)
        #expect(DataGridStyle.defaultWidth(for: .uuid) == 260)
        #expect(DataGridStyle.defaultWidth(for: .timestamp) == 200)
        #expect(DataGridStyle.defaultWidth(for: .text) == 160)
        #expect(DataGridStyle.defaultWidth(for: .decimal) == 160)
        #expect(DataGridStyle.defaultWidth(for: .json) == 160)
        for kind in ValueKind.allCases {
            #expect(DataGridStyle.defaultWidth(for: kind) <= DataGridStyle.maximumDefaultWidth)
        }
    }

    @Test func rowHeightScalesWithFont() {
        #expect(DataGridStyle(fontSize: 12).rowHeight == 24)
        #expect(DataGridStyle(fontSize: 14).rowHeight == 28)
    }

    // MARK: Clipboard

    @Test func tabSeparatedCopyHasHeaderAndEmptyNulls() {
        let tsv = DataGridClipboard.tabSeparatedValues(content: .sample, rows: IndexSet([0, 1]), columnIndices: [0, 1, 3])
        let lines = tsv.components(separatedBy: "\n")
        #expect(lines.count == 3)
        #expect(lines[0] == "id\temail\tbalance")
        #expect(lines[1] == "1\tada@example.com\t1250.00")
        #expect(lines[2] == "2\tgrace@example.com\t")
    }

    @Test func rawTextCopiesNullAndDefaultAsEmpty() {
        #expect(DataGridClipboard.rawText(of: GridCell(text: "NULL", isNull: true)).isEmpty)
        #expect(DataGridClipboard.rawText(of: GridCell(text: "", isDefault: true)).isEmpty)
        #expect(DataGridClipboard.rawText(of: GridCell(text: "abc")) == "abc")
    }

    // MARK: Column mapping

    @Test func hiddenColumnsAreSkippedInTableColumns() {
        let controller = DataGridController()
        controller.apply(DataGridController.Input(content: .sample, hiddenColumnIDs: [1, 4]))

        #expect(controller.visibleColumnIndices == [0, 2, 3, 5, 6])
        #expect(controller.tableView.tableColumns.count == 6)
        #expect(controller.tableView.numberOfRows == 4)
        #expect(controller.contentColumnIndex(forTableColumn: 0) == nil)
        #expect(controller.contentColumnIndex(forTableColumn: 1) == 0)
        #expect(controller.contentColumnIndex(forTableColumn: 2) == 2)
        #expect(controller.tableColumnIndex(forContentColumn: 1) == nil)
        #expect(controller.tableColumnIndex(forContentColumn: 5) == 4)
        #expect(controller.gridColumn(for: controller.tableView.tableColumns[2])?.name == "active")
        #expect(controller.tableView.tableColumns[1].headerToolTip == "int4")
        #expect(controller.tableView.tableColumns[0].width == DataGridStyle.gutterWidth)
        #expect(controller.tableView.tableColumns[3].width == DataGridStyle.defaultWidth(for: .decimal))
    }

    @Test func columnWidthsSurviveReloadAndHiding() {
        let controller = DataGridController()
        controller.apply(DataGridController.Input(content: .sample))
        let resized = controller.tableView.tableColumns[2]
        resized.width = 321
        controller.tableViewColumnDidResize(
            Notification(name: NSTableView.columnDidResizeNotification, object: controller.tableView, userInfo: ["NSTableColumn": resized])
        )

        var content = GridContent.sample
        content.version += 1
        controller.apply(DataGridController.Input(content: content, hiddenColumnIDs: [0]))
        #expect(controller.tableView.tableColumns.count == 7)
        #expect(controller.tableView.tableColumns[1].width == 321)
    }

    @Test func focusRequestSelectsRowAndReportsSelection() {
        let controller = DataGridController()
        var reported: (rows: IndexSet, focused: GridCellPosition?)?
        var actions = GridActions()
        actions.onSelectionChange = { rows, focused in reported = (rows, focused) }
        let target = GridCellPosition(row: 2, column: 3)
        controller.apply(DataGridController.Input(content: .sample, focusedCell: target, actions: actions))

        #expect(controller.focusedCell == target)
        #expect(controller.tableView.selectedRowIndexes == IndexSet(integer: 2))
        #expect(reported?.rows == IndexSet(integer: 2))
        #expect(reported?.focused == target)
        #expect(controller.canEdit(target) == false)
        #expect(controller.canEdit(GridCellPosition(row: 0, column: 1)))
    }
}
