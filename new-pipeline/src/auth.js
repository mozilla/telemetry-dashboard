/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(function () {

// The state we used when asking for the token. A 16-character random string.
// We could use the actual app state if we wanted to.
let gRequestState;

/* Copied with implicit license from Auth0 docs: randomString */
function randomString(length) {
  var bytes = new Uint8Array(length);
  var random = window.crypto.getRandomValues(bytes);
  var result = [];
  var charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._~";
  random.forEach(function (c) {
    result.push(charset[c % charset.length]);
  });
  return result.join('');
}

const AUTH0_ORIGIN = "https://auth.mozilla.auth0.com/";
const AGGREGATES_APP_CLIENT_ID = "pnnvs075UmZpkL0vzQJh2KiMwjUcQ7b6";
const AGGREGATES_API_AUDIENCE_ID = "https://aggregates.telemetry.mozilla.org/";
const AGGREGATES_API_SCOPE = "read:aggregates";
function constructLoginUrl() {

  gRequestState = randomString(16);
  localStorage.setItem('gRequestState', gRequestState);

  let currentUrl = new URL(window.location.href);
  // Discard the hash in case there's an access_token in it. The dashboard
  // will restore state from Cookie.
  currentUrl.hash = "";

  const params = {
    scope: AGGREGATES_API_SCOPE,
    audience: AGGREGATES_API_AUDIENCE_ID,
    response_type: "token",
    client_id: AGGREGATES_APP_CLIENT_ID,
    redirect_uri: currentUrl.toString(),
		state: gRequestState,
  };

  let loginUrl = new URL(AUTH0_ORIGIN + "authorize");
  for (let [key, value] of Object.entries(params)) {
    loginUrl.searchParams.append(key, value);
  }

  return loginUrl.toString();
}

function constructLogoutUrl() {
  let currentUrl = new URL(window.location.href);
  // Reset the hash to the default measurement on logout since we don't want
  // lingering release-channel state to restart the login flow.
  currentUrl.hash = "measure=GC_MS";

  let logoutUrl = new URL(AUTH0_ORIGIN + "v2/logout");
  logoutUrl.searchParams.append("returnTo", currentUrl.toString());

  return logoutUrl.toString();
}

function displayAuthButton(buttonText, buttonUrl) {
  const lockIcon = document.createElement("i");
  lockIcon.className = "fa fa-lock";

  const button = document.createElement("a");
  button.className = "btn btn-default";
  button.id = "auth-button";
  button.appendChild(lockIcon);
  button.appendChild(document.createTextNode(buttonText));
  button.href = buttonUrl;

  const form = document.getElementById("auth-form");
  form.appendChild(button);
}

window.addEventListener("DOMContentLoaded", () => {
  if (!gAccessToken) {
    displayAuthButton(" Login", constructLoginUrl());
  } else {
    displayAuthButton(" Log out", constructLogoutUrl());
  }
});

/* Adapted from auth0.com with implicit licence: getParameterByName */
function getParameterByName(hash, name) {
  const match = RegExp("[#&]" + name + "=([^&]*)").exec(hash);
  return match && decodeURIComponent(match[1].replace(/\+/g, " "));
}

function extractAuth0FromUrl(url) {
  const hash = url.hash;
  gAccessToken = getParameterByName(hash, "access_token");
  gExpiresIn = getParameterByName(hash, "expires_in");
  gResponseState = getParameterByName(hash, "state");
  gRequestState = localStorage.getItem("gRequestState");
  if (gAccessToken && gResponseState !== gRequestState) {
    gAccessToken = null;
    console.error("Response state doesn't match request state. Aborting auth.");
  } else {
    // Inform telemetry.js of our user's access token.
    Telemetry.AuthorizationToken = gAccessToken;
  }
}

// See if there's a token here for our use.
extractAuth0FromUrl(new URL(window.location.href));

// Register an auth failed listener with telemetry.js.
Telemetry.AuthorizationFailed = () => {
  window.location = constructLoginUrl();
};

})();
