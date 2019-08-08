/**
 * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Deferred} from '../../../src/utils/promise';
import {addParamsToUrl} from '../../../src/url';
import {createFrameFor, originMatches} from '../../../src/iframe-video';
import {dict} from '../../../src/utils/object';
import {getData, listen} from '../../../src/event-helper';
import {isLayoutSizeDefined} from '../../../src/layout';
import {userAssert} from '../../../src/log';

/**
 * @description private constant which hold information
 * @private {!object} IvsVideoData
 */
const IvsVideoData = {
  imageDomain: 'https://ivx.ivideosmart.com',
  iframeDomain: 'https://ivsplayer-3-sp.com',// change as your local/remote domain
  iframePage: 'amp-host.html',
};

export class AmpIvsVideo extends AMP.BaseElement {
  /**
   * @param {!AmpElement} element
   * @constructor
   */
  constructor(element) {
    super(element);

    /**
     * @description private property that will hold iframe element
     * @private {?HTMLIFrameElement}
     */
    this.iframe_ = null;

    /**
     * @description private property that will hold videoid
     * @private {string}
     */
    this.videoId_ = '';

    /**
     * @description private property that will hold apikey
     * @private {string}
     */
    this.apiKey_ = '';

    /**
     * @description for player ready promise
     * @private {?Promise}
     */
    this.playerReadyPromise_ = null;

    /**
     * @description for player ready promise
     * @private {?Function}
     */
    this.playerReadyResolver_ = null;
  }

  /**
   * @override
   */
  isInteractive() {
    // ivs  videos are always interactive. There is no ivs param that
    // makes the video non-interactive.
    return true;
  }

  /**
   * @description pre connecting server domain
   * @param {boolean=} opt_onLayout
   * @override
   */
  preconnectCallback(opt_onLayout) {
    // for image domain
    this.preconnect.url(IvsVideoData.imageDomain, opt_onLayout);
    // for iframe domain
    this.preconnect.url(IvsVideoData.iframeDomain, opt_onLayout);
  }

  /**
   * @override
   */
  isLayoutSupported(layout) {
    return isLayoutSizeDefined(layout);
  }

  /**
   * @description on first build it will be called
   * @override
   */
  buildCallback() {
    // 'data-video-id is required attribute
    this.videoId_ = userAssert(
      this.element.getAttribute('data-video-id'),
      'The data-video-id attribute is required for <amp-ivs-video> %s',
      this.element
    );
    // 'data-video-id is required attribute
    this.apiKey_ = userAssert(
      this.element.getAttribute('data-api-key'),
      'The data-api-key attribute is required for <amp-ivs-video> %s',
      this.element
    );

    // creating player ready promise
    const readyDeferred = new Deferred();
    this.playerReadyPromise_ = readyDeferred.promise;
    this.playerReadyResolver_ = readyDeferred.resolve;
  }

  /**
   * @description it will placehold image in amp-img tag
   * @override
   */
  createPlaceholderCallback() {
    const placeholder = this.win.document.createElement('amp-img');
    this.propagateAttributes(['aria-label'], placeholder);
    const src = `${IvsVideoData.imageDomain}/serve/image/video/${this.videoId_}`;
    placeholder.setAttribute('src', src);
    placeholder.setAttribute('layout', 'fill');
    placeholder.setAttribute('placeholder', '');
    placeholder.setAttribute('referrerpolicy', 'origin');
    if (placeholder.hasAttribute('aria-label')) {
      placeholder.setAttribute(
        'alt',
        'Loading video - ' + placeholder.getAttribute('aria-label')
      );
    } else {
      placeholder.setAttribute('alt', 'Loading video');
    }
    return placeholder;
  }

  /**
   * @description in this method heavy stuff will be loaded
   * iframe will be created and other functionly will be added
   * @override
   */
  layoutCallback() {
    // creating iframe for the element
    this.iframe_ = createFrameFor(this, this.getIframeSrc_());
    // listen window load for page info extraction
    listen(this.win, 'load', this.prepareForExtraction_.bind(this));
    // listen message event from iframe
    listen(this.win, 'message', this.listenEvents_.bind(this));
    // return player ready promise
    return this.playerReadyPromise_;
  }

  /**
   * @description listening message events from iframe
   * @param {!Event} event
   * @private
   */
  listenEvents_(event) {
    // if messege is not from iframe then do nothing
    if (!originMatches(event, this.iframe_, IvsVideoData.iframeDomain)) {
      return;
    }
    const eventData = getData(event);
    // checking event is empty or not
    if (!eventData || !event.type || event.type != 'message') {
      return;
    }
    // checking if The eventdata isn't valid
    if (!eventData) {
      return;
    }
    // if event data is player ready resolve player ready
    if (eventData === 'player-ready') {
      this.playerReadyResolver_(true);
    }
  }

  /**
   * @description return iframe src with all required parameters
   * @private
   * @return {string} iframe src
   */
  getIframeSrc_() {
    // iframe page url
    let src = IvsVideoData.iframeDomain + '/' + IvsVideoData.iframePage;
    // gathering information about page and required videos
    const info = {
      pagetitle: this.element.ownerDocument.title,
      pageurl: this.win.location.href,
      pageOrigin: this.win.location.origin,
      videoid: this.videoId_,
      apikey: this.apiKey_,
    };
    // attaching information to the iframe page url link
    src = addParamsToUrl(src, info);
    return src;
  }

  /**
   * @description extract page document data and searlize to string
   * to send to iframe
   * @private
   */
  prepareForExtraction_() {
    const s = new XMLSerializer();
    const str = s.serializeToString(this.element.ownerDocument.body);
    this.sendToIframe_('windowloaded', str);
  }

  /**
   * @description common function to send info to iframe
   * @param {string} command
   * @param {Array<boolean>=} opt_args
   * @private
   */
  sendToIframe_(command, opt_args) {
    if (this.iframe_ && this.iframe_.contentWindow) {
      const message = JSON.stringify(
        dict({
          'command': command,
          'parameters': opt_args || [],
        })
      );
      this.iframe_.contentWindow./*OK*/ postMessage(
        message,
        IvsVideoData.iframeDomain
      );
    }
  }

  /** @override */
  viewportCallback(visible) {
    this.sendToIframe_(visible ? 'play' : 'pause');
  }

  /** @override */
  pauseCallback() {
    this.sendToIframe_('pause');
  }

  /** @override */
  resumeCallback() {
    console.log('resumeCallback');
  }
}

AMP.extension('amp-ivs-video', '0.1', AMP => {
  AMP.registerElement('amp-ivs-video', AmpIvsVideo);
});
