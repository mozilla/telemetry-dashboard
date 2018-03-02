/*
 * Get me a map of date -> channel -> version for each firefox version, telling
 * us what versions were most recent on which channels on a given day.
 * @param limit - Get the last `limit` versions, default 10
 */
(function(){
function getLatestVersions(limit=10) {

  const CHANNELS = ["release", "beta", "nightly"];

  // Days after release-channel release that other channels update
  const CHANNEL_DELAYS = [0, 1, 0];

	// Suffixes to apply to versions in this channel to line them up with crash_aggregates
  const CHANNEL_SUFFIXES = ['', '', 'a1'];

  let addVersion = function (version, add) {
    if (!add) {
      return version;
    }
    let major = version.split('.')[0];
    return (window.parseInt(major, 10) + add) + ".0"
  };

	var formatYYYYmmdd = function(d) {
		let day = d.getUTCDate();
		let month = (d.getUTCMonth() + 1);
		let year = d.getUTCFullYear();
		return `${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`;
	}

  let ret = {};

  var allReq = new XMLHttpRequest();
  allReq.addEventListener("load", function() {
    let firefoxVersions = undefined;
    try {
      firefoxVersions = JSON.parse(this.responseText).releases;
    } catch (e) {
      console.error("Couldn't parse firefox version history JSON");
      return;
    }

    let sortedKeys = Object.keys(firefoxVersions)
      .filter(key => ["major", "stability"].includes(firefoxVersions[key].category))
      .filter(key => key != "firefox-47.0.2") // 47.0.2 was released way into 49.* so best to ignore it
      .sort((a, b) => firefoxVersions[a].date < firefoxVersions[b].date);

    // Truncate
    sortedKeys.length = limit;

    let oldDate = new Date(firefoxVersions[sortedKeys[sortedKeys.length - 1]].date);
    oldDate.setHours(12); // To deal with f-ing DST, oh how I hate DST
    let tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    let versionIndex = sortedKeys.length - 1;
    while (oldDate < tomorrow) {
      if (versionIndex > 0) {
        if (firefoxVersions[sortedKeys[versionIndex - 1]].date == formatYYYYmmdd(oldDate)) {
          versionIndex--;
        }
      }
      CHANNELS.forEach((channel, i) => {
        let channelDate = new Date(oldDate);
        channelDate.setDate(channelDate.getDate() + CHANNEL_DELAYS[i]);
        if (!(formatYYYYmmdd(channelDate) in ret)) {
          ret[formatYYYYmmdd(channelDate)] = {};
        }
        ret[formatYYYYmmdd(channelDate)][channel] = addVersion(firefoxVersions[sortedKeys[versionIndex]].version, i) + CHANNEL_SUFFIXES[i];
      });
      oldDate.setDate(oldDate.getDate() + 1);
    }
  });
  allReq.addEventListener("error", () => console.error("Failed to load firefox versions history"));
  allReq.open("GET", "https://product-details.mozilla.org/1.0/firefox.json", false);
  allReq.send();

  if (Object.keys(ret).length == 0) {
    console.warn("getLatestVersions(): something went wrong, returning nothing");
    return undefined;
  }
  return ret;
}

window.getLatestVersions = getLatestVersions;
}());
