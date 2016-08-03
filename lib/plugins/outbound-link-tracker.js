/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


var assign = require('object-assign');
var delegate = require('dom-utils/lib/delegate');
var parseUrl = require('dom-utils/lib/parse-url');
var provide = require('../provide');
var usage = require('../usage');
var createFieldsObj = require('../utilities').createFieldsObj;
var getAttributeFields = require('../utilities').getAttributeFields;


/**
 * Registers outbound link tracking on a tracker object.
 * @constructor
 * @param {Object} tracker Passed internally by analytics.js
 * @param {?Object} opts Passed by the require command.
 */
function OutboundLinkTracker(tracker, opts) {

  usage.track(tracker, usage.plugins.OUTBOUND_LINK_TRACKER);

  // Feature detects to prevent errors in unsupporting browsers.
  if (!window.addEventListener) return;

  this.opts = assign({
    events: ['click'],
    linkSelector: 'a',
    shouldTrackOutboundLink: this.shouldTrackOutboundLink,
    fieldsObj: {},
    attributePrefix: 'ga-',
    hitFilter: null,
    fallback: '_blank',
    fallbackWait: 500
  }, opts);

  this.tracker = tracker;

  // Binds methods.
  this.handleLinkInteractions = this.handleLinkInteractions.bind(this);

  // Creates a mapping of events to their delegates
  this.delegates = {};
  this.opts.events.forEach(function(event) {
    this.delegates[event] = delegate(document, event, this.opts.linkSelector,
        this.handleLinkInteractions, {deep: true, useCapture: true});
  }.bind(this));
}


/**
 * Handles all interactions on link elements. A link is considered an outbound
 * link if its hostname property does not match location.hostname. When the
 * beacon transport method is not available, the default fallback is to set
 * the links target to "_blank" to ensure the hit can be sent.
 * @param {Event} event The DOM click event.
 * @param {Element} link The delegated event target.
 */
OutboundLinkTracker.prototype.handleLinkInteractions = function(event, link) {

  if (this.opts.shouldTrackOutboundLink(link, parseUrl)) {

    var defaultFields = {
      transport: 'beacon',
      eventCategory: 'Outbound Link',
      eventAction: event.type,
      eventLabel: link.href
    };

    var userFields = assign({}, this.opts.fieldsObj,
        getAttributeFields(link, this.opts.attributePrefix));

    var target = (link.target && !link.target.match(/^_(self|parent|top)$/i))
        ? link.target : false;

    // ctrl/shift/meta clicks behave as _blank
    if (event.ctrlKey || event.shiftKey || event.metaKey || event.which == 2) {
      target = '_blank';
    }

    // Uses a fallback if the browser doesn't support the
    // beacon transport method & a fallback is enabled.
    if (!navigator.sendBeacon && this.opts.fallback) {
      if (this.opts.fallback === '_blank') {
        // Fallback to open outbound links in a new tab
        link.target = '_blank';
      } else if (this.opts.fallback === 'wait' && !target) {
        // Fallback to wait for the analytics event to transmit (with a timeout)
        // Only applies if the link has no `target`
        event.preventDefault();
        var hitCallback = this.createHitCallback(link);
        defaultFields.hitCallback = hitCallback;
        this.fallbackTimeout = setTimeout(hitCallback, this.opts.fallbackWait);
      }
    }

    this.tracker.send('event', createFieldsObj(
        defaultFields, userFields, this.tracker, this.opts.hitFilter, link));
  }
};


/**
 * Determines whether or not the tracker should send a hit when a link is
 * clicked. By default links with a hostname property not equal to the current
 * hostname are tracked.
 * @param {Element} link The link that was clicked on.
 * @param {Function} parseUrl A cross-browser utility method for url parsing.
 * @return {boolean} Whether or not the link should be tracked.
 */
OutboundLinkTracker.prototype.shouldTrackOutboundLink =
    function(link, parseUrl) {

  var url = parseUrl(link.href);
  return url.hostname != location.hostname &&
      url.protocol.slice(0, 4) == 'http';
};


/**
 * Removes all event listeners and instance properties.
 */
OutboundLinkTracker.prototype.remove = function() {
  Object.keys(this.delegates).forEach(function(key) {
    this.delegates[key].destroy();
  }.bind(this));
};


/**
 * Callback to run after a successful track
 * @param {string} link The link to redirect to
 * @returns {function} A hit callback function
 */
OutboundLinkTracker.prototype.createHitCallback = function(link) {
    var hitCallbackHasRun = false;

    return function hitCallback() {
        // only run once
        if (hitCallbackHasRun) { return; }
        clearTimeout(this.fallbackTimeout);
        hitCallbackHasRun = true;

        document.location = link;
    }.bind(this);
};


provide('outboundLinkTracker', OutboundLinkTracker);
