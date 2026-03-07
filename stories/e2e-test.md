## Story: Hello World Greeter CLI

Build a tiny Node.js CLI script called `greet.js` that accepts a `--name` flag and prints "Hello, <name>!" to stdout. If no name is provided, default to "World".

### Acceptance Criteria

- Given the user runs `node greet.js`, Then stdout contains "Hello, World!"
- Given the user runs `node greet.js --name Alice`, Then stdout contains "Hello, Alice!"
- Given the user runs `node greet.js --name ""`, Then stdout contains "Hello, World!" (empty string falls back to default)
