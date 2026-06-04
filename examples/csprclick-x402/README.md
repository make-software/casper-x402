# CSPR.click x402 demo

This example is a Vite + React demo for using CSPR.click to sign an x402
payment authorization with EIP-712 typed data. It loads a payment challenge
from a local protected resource, asks the connected wallet to sign the typed
data, then sends the signed payment payload back to fetch the paid resource.

The x402 flow is written out step by step on purpose, making the data exchanged
with CSPR.click and the x402-enabled resource server easy to inspect.

## Usage

Install dependencies:

```sh
npm install
```

Start the demo:

```sh
npm start
```

Open the Vite local URL shown in the terminal, then sign in with CSPR.click.
The app expects the resource server demo in `../server` running at:

```text
http://localhost:4021
```

When the endpoint returns a `402` response with a `Payment-Required` header,
the page displays the payment details. Click **Get paid resource** to sign the
authorization and request the protected resource.

## Scripts

- `npm start` - run the Vite development server.
- `npm run build` - type-check and build the app.
- `npm run preview` - preview the production build.
- `npm run lint` - run ESLint.
- `npm run format` - format source files with Prettier.
