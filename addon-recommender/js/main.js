"use strict";

var addonMapping = null;
var rawItemsMatrix = null;

function setupAutocomplete() {
  var suggestions = []

  for (var addonId in addonMapping) {
    suggestions.push({id: addonId, text: addonMapping[addonId]});
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

  query = $('.select2, .select2-multiple').select2({ placeholder: 'Your Firefox Addons',
                                                     data: suggestions,
                                                     multiple: true,
                                                     openOnEnter: false,
                                                     closeOnSelect: true,
                                                     sorter: sortFunc
                                                   });
  query.on("change", function(e) {
    suggestAddons($(this).val().split(','));
  });
  $('#search').click(search);
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
    if (!addonIdsAsNumbers.includes(addon.id)) {
      const d = math.dot(tUserFactors, addon.features);
      distances[addonMapping[addon.id]] = d;
    }
  });

  // Update the dashboard with the suggestions.
  var sorted = getSortedKeys(distances);
  var table = $('#recommendations');
  var rows = ""

  $("#recommendations tr").remove();
  for (var i = 0; i < 10; i++) {
    rows += "<tr><td>" + sorted[i] + "</td></tr>";
  }
  table.append(rows);
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

$.when(
  $.getJSON('data/addon_mapping.json', function(data) {
    addonMapping = data;
  }),
  $.getJSON('data/item_matrix.json', function(data) {
    // Data is in the following format:
    // [
    //  ... { id: 123, features: [1, 2, 3]}, ...
    // ]
    rawItemsMatrix = data;
  })
).then(function() {
  if (!addonMapping || !rawItemsMatrix) {
    console.error("There was an error loading the data files.");
    return;
  }
  setupAutocomplete();
});
