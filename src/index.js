// CSS
import "../libs/bootstrap-3.3.7.css";
import "../libs/font-awesome-4.7.0.css";
import "./css/dashboards.css";

// JS libs
import "../libs/jquery-3.3.1.js";
import "../libs/bootstrap-3.3.7.js";
import "./js/analytics.js";


// Check for permalink - if there is a URL hash, the user probably clicked on a
// permalink to the old dashboard, so redirect them there with the same state to
// avoid breaking permalinks.
if (window.location.hash.length > 1) {
  // window.location.href = `${window.location.origin}/advanced/${window.location.hash}`;
  window.location.href = window.location.origin + "/advanced/" + window.location.hash;
}
