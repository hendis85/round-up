const express = require("express");
const app = express();
const { resolve } = require("path");
const envPath = resolve(".env");
const env = require("dotenv").config({ path: envPath });
const stripe = require("stripe")(env.parsed.STRIPE_SECRET_KEY);
const axios = require("axios");

app.use(express.static("./client"));
app.use(
  express.json({
    // We need the raw body to verify webhook signatures.
    // Let's compute it only when hitting the Stripe webhook endpoint.
    verify: function(req, res, buf) {
      if (req.originalUrl.startsWith("/webhook")) {
        req.rawBody = buf.toString();
      }
    }
  })
);
app.set("view engine", "ejs");
app.set("views", resolve("./client/views"));

// Render the checkout page
app.get("/", (req, res) => {
  res.render("index.ejs", { isComplete: false });
});

// Render the become a partner page
app.get("/become-a-partner", (req, res) => {
  const stateValue = `some-random-value-${Math.floor(Math.random() * 1000)}`;
  const url = `https://connect.stripe.com/express/oauth/authorize?redirect_uri=${
    env.parsed.REDIRECT_DOMAIN
  }/verify-account&client_id=${
    env.parsed.STRIPE_CONNECT_CLIENT_ID
  }&state=${stateValue}`;

  res.render("connect-onboarding.ejs", { url });
});

// Create a new connected account with the onboarding info from Connect
app.get("/verify-account", async (req, res) => {
  axios
    .post("https://connect.stripe.com/oauth/token", {
      client_secret: env.parsed.STRIPE_SECRET_KEY,
      code: req.query.code,
      grant_type: "authorization_code"
    })
    .then(() => {
      const path = resolve("./client/connect-onboarding.html");
      res.sendFile(path);
    })
    .catch(err => {
      console.log("err", err);
    });
});

const calculateOrderTotal = (items, currency) => {
  // Hardcoding for demo purposes
  // In your real app calculate the order total from the items in the cart + selected currency
  return 5909;
};

const roundOrderUp = (items, currency) => {
  // Hardcoding for demo purposes
  // In your real app calculate the order total and round up to the nearest dollar
  return { total: 6000, donation: 91 };
};

// Create a PaymentIntent to use in our checkout page
app.post("/create-payment-intent", async (req, res) => {
  const { items, currency } = req.body;
  const publicKey = env.parsed.STRIPE_PUBLIC_KEY;

  const paymentIntent = await stripe.paymentIntents.create({
    amount: calculateOrderTotal(items, currency),
    currency: currency
  });

  // Fetch connected accounts to display in our donation dropdown
  const connectedAccounts = await stripe.accounts.list({ limit: 3 });
  const connectedAccountIds = connectedAccounts.data.map(account => ({
    id: account.id,
    name: account.email // TODO: change to business_profile
  }));

  res.send({
    clientSecret: paymentIntent.client_secret,
    id: paymentIntent.id,
    redirectDomain: env.parsed.REDIRECT_DOMAIN,
    connectedAccounts: connectedAccountIds,
    publicKey
  });
});

// Create a PaymentIntent to use in our checkout page
app.post("/update-payment-intent", async (req, res) => {
  const { items, currency, id, isDonating, selectedAccount } = req.body;
  const { total, donation } = roundOrderUp(items, currency);
  if (isDonating) {
    // Update the PaymentIntent with the new total and flag how much to donate
    stripe.paymentIntents.update(id, {
      amount: total,
      transfer_group: `group_${id}`, // TODO: Make sure this only gets set once
      metadata: {
        destination: selectedAccount,
        donationAmount: donation
      }
    });
  } else {
    stripe.paymentIntents.update(id, {
      amount: calculateOrderTotal(items, currency)
    });
  }
  res.send();
});

// A webhook to receive events sent from Stripe
app.post("/webhook", async (req, res) => {
  // Check if webhook signing is configured.
  if (env.parsed.STRIPE_WEBHOOK_SECRET) {
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    let signature = req.headers["stripe-signature"];
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        env.parsed.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    data = event.data;
    eventType = event.type;
  } else {
    // Webhook signing is recommended, but if the secret is not configured in `config.js`,
    // we can retrieve the event data directly from the request body.
    data = req.body.data;
    eventType = req.body.type;
  }

  if (eventType === "payment_intent.succeeded") {
    // Check to see if there is information about a donation on this PaymentIntent
    if (
      data.object.metadata.donationAmount &&
      data.object.metadata.donationOrg
    ) {
      // Here we use Connect to directly transfer the funds to a connected account
      // but you can simply use metadata to flag payments that have added donations
      // and process a check once a month
      const transfer = await stripe.transfers.create({
        amount: data.object.metadata.donationAmount,
        currency: "usd",
        destination: data.object.metadata.destination,
        transfer_group: data.object.transfer_group
      });

      console.log(
        `Processed a donation for ${
          data.object.metadata.destination
        } with transfer ${transfer.id}`
      );
    }
    // Fulfill any other orders or e-mail receipts
    res.sendStatus(200);
  }
});

// Start server
const listener = app.listen(process.env.PORT || 3000, function() {
  console.log("Your app is listening on port " + listener.address().port);
});
