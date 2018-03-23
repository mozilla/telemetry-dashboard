(function() {

window.trackingEnabled = () => {
  var _dntStatus = navigator.doNotTrack || navigator.msDoNotTrack;
  var fx = navigator.userAgent.match(/Firefox\/(\d+)/);
  var ie10 = navigator.userAgent.match(/MSIE 10/i);
  var w8 = navigator.appVersion.match(/Windows NT 6.2/);
  if (fx && Number(fx[1]) < 32) {
    _dntStatus = 'Unspecified'; // bug 887703
  } else if (ie10 && w8) {
    _dntStatus = 'Unspecified';
  } else {
    _dntStatus = {'0': 'Disabled', '1': 'Enabled'}[_dntStatus] || 'Unspecified';
  }

  window.trackingEnabled = () => {
    return _dntStatus != 'Enabled';
  }
  return window.trackingEnabled();
};

if (window.trackingEnabled()) {
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'UA-49796218-2');

  // Decorate outbound links from the top frame of whitelisted pages
  const OUTBOUND_LINKS_WHITELIST = new Set([
    '/',
    '/index.html',
  ]);

  if (OUTBOUND_LINKS_WHITELIST.has(window.location.pathname)) {
    window.addEventListener("DOMContentLoaded", () => {
      document.addEventListener("click", decoratedLinkHandler, true);
    });
  }
}

function decoratedLinkHandler(e) {
  if (e.button != 0) {
    return;
  }
  let anchor = findAnchor(e.target);
  if (anchor) {
    gtag('event', 'outbound_link', {
      'event_category': 'user_interaction',
      'event_action': 'click',
      'event_label': anchor.href,
      'transport_type': 'beacon',
    });
  }
}

function findAnchor(el) {
  while (el && el.nodeName != 'A') {
    el = el.parentElement;
  }
  return el;
}

}());
