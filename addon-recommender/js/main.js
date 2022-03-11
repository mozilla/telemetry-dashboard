"use strict";

var addonMapping = null;
var rawItemsMatrix = null;
var topAddonsInfo = null;

// The model data files.
const itemMatrixURI =
  'https://s3-us-west-2.amazonaws.com/telemetry-public-analysis-2/telemetry-ml/addon_recommender/item_matrix.json';
const addonMappingURI =
  'https://s3-us-west-2.amazonaws.com/telemetry-public-analysis-2/telemetry-ml/addon_recommender/addon_mapping.json';

// The AMO API endpoint used to request the top addons.
const topAddonsURI =
  'https://addons.mozilla.org/api/v4/addons/search/?q=&app=firefox&type=extension&sort=users';

function setupAutocomplete() {
  var suggestions = []

  for (var addonId in addonMapping) {
    suggestions.push({id: addonId, text: addonMapping[addonId].name});
  }

  let sortFunc = function(data) {
    return data.sort(function(a,b){
        a = a.text.toLowerCase();
        b = b.text.toLowerCase();
        if (a == b) {
          return -1;
        }
        return (a > b) ? 1 : -1;
    });
  };

  let query = $('.select2, .select2-multiple')
                .select2({ placeholder: 'Your Firefox Addons',
                           data: suggestions,
                           multiple: true,
                           openOnEnter: false,
                           closeOnSelect: true,
                           sorter: sortFunc
                         });
  query.on("change", function(e) {
    let queriedAddons = $(this).val();
    if (queriedAddons) {
      suggestAddons(queriedAddons.split(','));
    } else {
      // If no addons where requested, display the top ones.
      displayTopAddons();
    }
  });
  $('#search').click(search);
}

function renderAddonSuggestions(sortedAddons) {
  var table = $('#recommendations');
  var rows = ""

  $("#recommendations tr").remove();
  for (var i = 0; i < 10; i++) {
    rows += "<tr><td>" + sortedAddons[i] + "</td></tr>";
  }
  table.append(rows);
}

function suggestAddons(addonIds) {
  const addonIdsAsNumbers = addonIds.map(id => parseInt(id));

  // Build the query vector by setting the position of the queried addons to 1.0
  // and the other to 0.0.
  let addonVector =
    rawItemsMatrix.map(addon => addonIdsAsNumbers.includes(addon.id) ? 1.0 : 0.0);

  // Approximate representation of the user in latent space.
  const addonsMatrix = buildAddonsMatrix(rawItemsMatrix);
  const tAddonsMatrix = math.transpose(addonsMatrix);
  const tAddonsVector = math.transpose(addonVector);
  let userFactors = math.multiply(addonVector, addonsMatrix);
  const tUserFactors = math.transpose(userFactors);

  // Compute distance between the user and all the add-ons in latent space.
  let distances = {};
  rawItemsMatrix.forEach(addon => {
    // We don't really need to show the items we requested. They will always
    // end up with the greatest score.
    if (!addonIdsAsNumbers.includes(addon.id) &&
        addonMapping[addon.id].isWebextension) {
      const d = math.dot(tUserFactors, addon.features);
      distances[addonMapping[addon.id].name] = d;
    }
  });

  // Update the dashboard with the suggestions.
  var sorted = getSortedKeys(distances);
  renderAddonSuggestions(sorted);
}

function getSortedKeys(obj) {
  var keys = [];

  for (var key in obj) {
    keys.push(key);
  }

  return keys.sort(function(a,b){return obj[b]-obj[a]});
}

function buildAddonsMatrix(data) {
  let m = data.map(a => a.features);
  // Each vector in |m| will be a row in the matrix.
  return math.matrix(m, 'dense', 'number');
}

function displayTopAddons() {
  if (!topAddonsInfo || !topAddonsInfo.results) {
    console.error("Malformed or empty AMO response.");
    return;
  }
  let addonNames = topAddonsInfo.results.map(info => info.name[info.default_locale]);
  renderAddonSuggestions(addonNames);
}

$.when(
  $.getJSON(addonMappingURI, function(data) {
    addonMapping = data;
  }),
  $.getJSON(itemMatrixURI, function(data) {
    // Data is in the following format:
    // [
    //  ... { id: 123, features: [1, 2, 3]}, ...
    // ]
    rawItemsMatrix = data;
  }),
  $.get(topAddonsURI, function(data) {
    // The format of the response is documented here:
    // http://addons-server.readthedocs.io/en/latest/topics/api/addons.html#search
    topAddonsInfo = data;
  })
).then(function() {
  if (!addonMapping || !rawItemsMatrix || !topAddonsInfo) {
    console.error("There was an error loading the data files.");
    return;
  }
  setupAutocomplete();
  // We've just loaded the page. Display the top addons.
  displayTopAddons();
});
