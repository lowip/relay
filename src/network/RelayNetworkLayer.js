/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelayNetworkLayer
 * @typechecks
 * @flow
 */

'use strict';

import type RelayMutationRequest from 'RelayMutationRequest';
const RelayProfiler = require('RelayProfiler');
import type RelayQuery from 'RelayQuery';
const RelayQueryRequest = require('RelayQueryRequest');
import type {NetworkLayer} from 'RelayTypes';

const invariant = require('invariant');
const resolveImmediate = require('resolveImmediate');

/**
 * @internal
 *
 * `RelayNetworkLayer` provides a method to inject custom network behavior.
 */
class RelayNetworkLayer {
  _injectedNetworkLayer: ?NetworkLayer;
  _queue: ?Array<RelayQueryRequest>;

  constructor() {
    this._injectedNetworkLayer = null;
    this._queue = null;
  }

  injectNetworkLayer(networkLayer: ?NetworkLayer): void {
    this._injectedNetworkLayer = networkLayer;
  }

  sendMutation(mutationRequest: RelayMutationRequest): void {
    var networkLayer = this._getCurrentNetworkLayer();
    var promise = networkLayer.sendMutation(mutationRequest);
    if (promise) {
      Promise.resolve(promise).done();
    }
  }

  sendQueries(queryRequests: Array<RelayQueryRequest>): void {
    var networkLayer = this._getCurrentNetworkLayer();
    var promise = networkLayer.sendQueries(queryRequests);
    if (promise) {
      Promise.resolve(promise).done();
    }
  }

  supports(...options: Array<string>): boolean {
    var networkLayer = this._getCurrentNetworkLayer();
    return networkLayer.supports(...options);
  }

  _getCurrentNetworkLayer(): NetworkLayer {
    invariant(
      this._injectedNetworkLayer,
      'RelayNetworkLayer: Use `injectNetworkLayer` to configure a network ' +
      'layer.'
    );
    return this._injectedNetworkLayer;
  }

  /**
   * Schedules the supplied `query` to be sent to the server.
   *
   * This is a low-level transport API; application code should use higher-level
   * interfaces exposed by RelayContainer for retrieving data transparently via
   * queries defined on components.
   */
  fetchRelayQuery(query: RelayQuery.Root): Promise {
    const currentQueue = this._queue || [];
    if (!this._queue) {
      this._queue = currentQueue;
      resolveImmediate(() => {
        this._queue = null;
        profileQueue(currentQueue);
        this.sendQueries(currentQueue);
      });
    }
    const request = new RelayQueryRequest(query);
    currentQueue.push(request);
    return request.getPromise();
  }
}

/**
 * Profiles time from request to receiving the first server response.
 */
function profileQueue(currentQueue: Array<RelayQueryRequest>): void {
  // TODO #8783781: remove aggregate `fetchRelayQuery` profiler
  let firstResultProfiler = RelayProfiler.profile('fetchRelayQuery');
  currentQueue.forEach(query => {
    const profiler = RelayProfiler.profile('fetchRelayQuery.query');
    const onSettle = () => {
      profiler.stop();
      if (firstResultProfiler) {
        firstResultProfiler.stop();
        firstResultProfiler = null;
      }
    };
    query.getPromise().done(onSettle, onSettle);
  });
}

RelayProfiler.instrumentMethods(RelayNetworkLayer.prototype, {
  sendMutation: 'RelayNetworkLayer.sendMutation',
  sendQueries: 'RelayNetworkLayer.sendQueries',
});

module.exports = RelayNetworkLayer;
