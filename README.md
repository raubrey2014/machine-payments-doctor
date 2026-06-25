# Machine Payments Doctor

Machine Payments Doctor checks whether an API is ready for machine payment clients. It inspects discovery files, finds OpenAPI operations that appear to require payment, probes unpaid requests for x402-style `402 Payment Required` responses, and returns fix-oriented results.

The first public API is inspect-only. It does not retry paid requests, load wallet keys, or run an MCP server.

## Local Development

Install dependencies and run the Next.js app:

```bash
npm install
npm run dev
```

Open `http://localhost:3000` to use the UI.

The scanner can probe `localhost` targets while running locally. A hosted deployment can only check URLs reachable from that deployment.

This repo uses Next 16. Before changing route handlers or app-router behavior, read the relevant local docs under `node_modules/next/dist/docs/`.

## Programmatic API

`POST /api/check` accepts JSON:

```json
{ "url": "https://api.example.com" }
```

The `url` must be an absolute `http:` or `https:` URL.

Successful responses return `200` with:

```json
{
  "url": "https://api.example.com/",
  "score": 84,
  "grade": "B",
  "categories": [
    {
      "id": "discovery",
      "label": "Discovery",
      "description": "Can agents find and understand your service?",
      "weight": 0.33,
      "score": 100,
      "grade": "A"
    }
  ],
  "issues": [
    {
      "id": "protocol.mainnet_usdc_missing",
      "category": "protocol",
      "severity": "error",
      "title": "Payment payload does not include mainnet USDC",
      "detail": "No mainnet USDC found...",
      "fix": "Add USDC on Base or Solana.",
      "checkId": "payment_assets",
      "endpoint": {
        "method": "GET",
        "path": "/paid",
        "fullUrl": "https://api.example.com/paid"
      }
    }
  ],
  "doctorPrompt": "# Machine Payments Doctor - api.example.com...",
  "baseChecks": [],
  "endpoints": [],
  "totalEndpoints": 0,
  "specTitle": "Example API",
  "testedAt": "2026-06-25T00:00:00.000Z"
}
```

Error responses:

```json
{ "error": "Invalid JSON" }
```

```json
{ "error": "url is required" }
```

```json
{ "error": "Invalid URL" }
```

All errors above use HTTP `400`.

## Validation

Run:

```bash
npm run lint
npm run build
```

Useful local API checks:

```bash
curl -i -X POST http://localhost:3000/api/check -H 'Content-Type: application/json' --data '{'
curl -i -X POST http://localhost:3000/api/check -H 'Content-Type: application/json' --data '{}'
curl -i -X POST http://localhost:3000/api/check -H 'Content-Type: application/json' --data '{"url":"ftp://example.com"}'
curl -s -X POST http://localhost:3000/api/check -H 'Content-Type: application/json' --data '{"url":"https://api.example.com"}' | jq
```
