/* ------- Global variables ------- */
var config = {
  clientSecret: "", // stores the PaymentIntent client_secret created on the server
  id: "",
  selectedAccount: "",
  isDonating: false
};

var stripe; // Wait to initialize until we have our public key
var cardNumber; // Used to collect card number for later usage with Stripe.js

/* ------- PaymentIntent UI helpers ------- */

/*
 * Calls stripe.handleCardPayment which creates a pop-up modal to
 * prompt the user to enter  extra authentication details without leaving your page
 */
var triggerModal = function() {
  toggleSpinner(true);
  stripe
    .handleCardPayment(config.clientSecret, cardNumber)
    .then(function(result) {
      toggleSpinner(false);
      if (result.error) {
        var errorMsg = document.getElementById("error-message");
        errorMsg.style.display = "block";
        errorMsg.style.opacity = 1;
        errorMsg.textContent = result.error.message;
        setTimeout(function() {
          errorMsg.style.display = "none";
          errorMsg.style.opacity = 0;
        }, 4000);
      } else {
        displayMessage();
      }
    });
};

/* ------- General UI helpers ------- */

/* Add a spinner in the button */
var toggleSpinner = function(spinnerOn) {
  var buttonText = document.getElementById("button-text"),
    buttonSpinner = document.getElementById("button-spinner");
  if (spinnerOn) {
    buttonText.style.display = "none";
    buttonSpinner.style.display = "inline-block";
  } else {
    buttonText.style.display = "inline-block";
    buttonSpinner.style.display = "none";
  }
};

/* Shows a success / error message when the payment is complete */
var displayMessage = function(hasError) {
  document.getElementById("payment-form").style.display = "none";
  document.getElementById("checkout-items").style.display = "none";
  document.getElementById("checkout-form").classList.add("done");
  if (hasError) {
    document.getElementById("error-message").style.display = "block";
  } else if (config.isDonating) {
    document.getElementById("success-message-donated").style.display = "block";
  } else {
    document.getElementById("success-message").style.display = "block";
  }
};

/* Create a PaymentIntent with a hardcoded amount and currency */
var createPaymentIntent = function() {
  var data = {
    items: [
      { id: "book_dream_machine", quantity: 1 },
      { id: "book_revolt_public", quantity: 1 }
    ],
    currency: "usd"
  };

  return fetch("/create-payment-intent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  })
    .then(function(result) {
      return result.json();
    })
    .then(function(data) {
      initStripe(data.publicKey);
      config.clientSecret = data.clientSecret;
      config.id = data.id;
      config.selectedAccount = data.connectedAccounts[0].id;
      populateConnectedAccounts(data.connectedAccounts);
    });
};

var populateConnectedAccounts = function(connectedAccounts) {
  var select = document.querySelector("#round-up select");
  connectedAccounts.forEach(function(account, i) {
    // In test mode we will hardcode the names of the organizations.
    // In a real integration you could display the business name
    // select[i] = new Option(account.business_name, account.id);
    const fakeName = i ? "Donors Choose" : "Children's Book Fund";
    select[i] = new Option(fakeName, account.id);
  });
};

var initStripe = function(publicKey) {
  stripe = Stripe(publicKey, {
    betas: ["card_payment_method_beta_1"]
  });

  /* ------- Set up Stripe Elements to use in checkout form ------- */
  var elements = stripe.elements();
  var style = {
    base: {
      color: "#32325d",
      fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
      fontSmoothing: "antialiased",
      fontSize: "16px",
      "::placeholder": {
        color: "#aab7c4"
      }
    },
    invalid: {
      color: "#fa755a",
      iconColor: "#fa755a"
    }
  };

  cardNumber = elements.create("cardNumber", {
    style: style
  });

  cardNumber.mount("#card-number");

  var cardExpiry = elements.create("cardExpiry", {
    style: style
  });
  cardExpiry.mount("#card-expiry");

  var cardCvc = elements.create("cardCvc", {
    style: style
  });

  cardCvc.mount("#card-cvc");
};

var updateTotal = function(isDonating) {
  var total = document.querySelector(".total");
  var donation = document.querySelector(".donation");
  total.textContent = isDonating ? "$60.00" : "$59.19";
  donation.style.display = isDonating ? "flex" : "none";
  document.querySelector("button").disabled = true;

  var data = {
    items: [
      { id: "book_dream_machine", quantity: 1 },
      { id: "book_revolt_public", quantity: 1 }
    ],
    currency: "usd",
    id: config.id,
    isDonating: isDonating,
    selectedAccount: config.selectedAccount
  };

  return fetch("/update-payment-intent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  }).then(function(result) {
    document.querySelector("button").disabled = false;
    return result.json();
  });
};

/* ------- Set up on page load ------- */

var urlParams = new URLSearchParams(window.location.search);
var clientSecret = urlParams.get("payment_intent_client_secret");

// If we have a client secret in the URL it means that we are being redirected from
if (clientSecret) {
  handleRedirectReturn(clientSecret);
} else {
  createPaymentIntent();
}

document
  .getElementById("submit-button")
  .addEventListener("click", function(evt) {
    evt.preventDefault();
    triggerModal();
  });

document
  .querySelector("#round-up input")
  .addEventListener("change", function(evt) {
    var isDonating = evt.target.checked;
    config.isDonating = isDonating;
    document.querySelector("#round-up .select").style.display = isDonating
      ? "block"
      : "none";
    updateTotal(isDonating);
  });

document
  .querySelector("#round-up select")
  .addEventListener("change", function(evt) {
    config.selectedAccount = evt.target.value;
  });
