import Testing
@testable import TableCore

@Suite("SQL tokenizer")
struct SQLTokenizerTests {
    private func kinds(_ sql: String) -> [SQLToken.Kind] {
        SQLTokenizer.tokenize(sql).filter { $0.kind != .whitespace }.map(\.kind)
    }

    @Test("Classifies keywords, identifiers, numbers and strings")
    func basicTokens() {
        let tokens = SQLTokenizer.tokenize("SELECT id, 'a''b', 1.5e3 FROM users")
        let texts = tokens.filter { $0.kind != .whitespace }.map(\.text)
        #expect(texts == ["SELECT", "id", ",", "'a''b'", ",", "1.5e3", "FROM", "users"])
        #expect(kinds("SELECT id, 'a''b', 1.5e3 FROM users") == [.keyword, .identifier, .punctuation, .string, .punctuation, .number, .keyword, .identifier])
    }

    @Test("Handles dollar quoting with and without tags")
    func dollarQuotes() {
        let sql = "CREATE FUNCTION f() RETURNS int AS $body$ select 1; $x$ $body$ LANGUAGE sql; $$;$$"
        let strings = SQLTokenizer.tokenize(sql).filter { $0.kind == .string }.map(\.text)
        #expect(strings == ["$body$ select 1; $x$ $body$", "$$;$$"])
    }

    @Test("Handles nested block comments and line comments")
    func comments() {
        let sql = "/* outer /* inner */ still */ SELECT 1 -- trailing\n;"
        let comments = SQLTokenizer.tokenize(sql).filter { $0.kind == .comment }.map(\.text)
        #expect(comments == ["/* outer /* inner */ still */", "-- trailing"])
    }

    @Test("Handles escape strings, quoted identifiers, parameters and casts")
    func escapesAndOperators() {
        let sql = "SELECT E'a\\'b', \"we\"\"ird\", $1::text, a <> b"
        let tokens = SQLTokenizer.tokenize(sql).filter { $0.kind != .whitespace }
        #expect(tokens[1].kind == .string && tokens[1].text == "E'a\\'b'")
        #expect(tokens[3].kind == .quotedIdentifier && tokens[3].text == "\"we\"\"ird\"")
        #expect(tokens[5].kind == .parameter && tokens[5].text == "$1")
        #expect(tokens[6].kind == .op && tokens[6].text == "::")
        #expect(tokens.contains { $0.kind == .op && $0.text == "<>" })
    }

    @Test("Ranges map back onto the source text")
    func ranges() {
        let sql = "select café, 42"
        for token in SQLTokenizer.tokenize(sql) {
            #expect(String(sql[token.range]) == token.text)
        }
        #expect(SQLTokenizer.tokenize(sql).map(\.text).joined() == sql)
    }

    @Test("Unterminated strings extend to the end of input")
    func unterminated() {
        let tokens = SQLTokenizer.tokenize("select 'abc")
        #expect(tokens.last?.kind == .string)
        #expect(tokens.last?.text == "'abc")
    }
}
