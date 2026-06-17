import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactCasperScheme } from "@make-software/casper-x402/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { AssetAmount } from "@x402/core/types";
config();

const casperAddress = process.env.CASPER_ADDRESS as `0x${string}`;
if (!casperAddress) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

const asset = process.env.ASSET;
if (!asset) {
  console.error("❌ ASSET environment variable is required");
  process.exit(1);
}
const assetAmount: AssetAmount = {
  asset,
  amount: "15000000000",
  extra: { name: "Wrapped CSPR", symbol: "WCSPR", version: "1", decimals: "9" },
};
const casperScheme = new ExactCasperScheme()
  .registerAsset("casper:casper-test", asset, 9)
  .registerMoneyParser(() => Promise.resolve(assetAmount));

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.001",
            network: "casper:casper-test",
            payTo: casperAddress,
          },
        ],
        description: "Weather data",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient).register("casper:casper-test", casperScheme),
  ),
);

app.get("/weather", (req, res) => {
  res.send({
    report: {
      weather: "sunny",
      temperature: 70,
    },
  });
});

app.listen(4021, () => {
  console.log(`Server listening at http://localhost:${4021}`);
});
