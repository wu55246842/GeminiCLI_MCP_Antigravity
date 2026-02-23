# Sample Investigation Prompts

Use these prompts with Gemini CLI or Antigravity to harness the full power of the provided `code_search`, `file_read`, and `build_investigation_report` tools.

## 1. Trace an Exception / Error Code
> "We see `ERR_AUTH_501` in the logs. Please use `code_search` to find all exact occurrences of this error code. For the file where it gets thrown, use `file_read` to fetch the 30 lines surrounding the `throw` statement to analyze the if-condition leading up to it."

## 2. API Data Flow Discovery
> "I need to map the data flow for the `@PostMapping("/login")` endpoint. First, use `code_search` or `symbol_hint` to find the exact Controller file. Read the method body using `file_read`. Find any underlying Service class it calls. Then use `code_search` to find that Service's implementation, and trace down until you hit the database Repository."

## 3. Incident Report Scaffolding
> "Production incident 8890 is ongoing with `NullPointerException` traces in the PaymentService. Please run the `build_investigation_report` tool with incidentTitle: 'Prod Incident 8890', services: ['PaymentService'], timeWindow: {start: '2023-11-01 10:00'}, and errorCodes: ['NPE']. Output the generated markdown so we can start filling in the findings."
