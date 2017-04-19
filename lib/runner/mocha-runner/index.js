'use strict';

const utils = require('q-promise-utils');
const qUtils = require('qemitter/utils');
const QEmitter = require('qemitter');
const _ = require('lodash');
const RunnerEvents = require('../../constants/runner-events');
const InsistantMochaRunner = require('./insistant-mocha-runner');

module.exports = class MochaRunner extends QEmitter {
    static init() {
        InsistantMochaRunner.init();
    }

    static create(config, browserAgent, testSkipper) {
        return new MochaRunner(config, browserAgent, testSkipper);
    }

    constructor(config, browserAgent, testSkipper) {
        super();

        this._config = config;
        this._browserAgent = browserAgent;
        this._testSkipper = testSkipper;
    }

    run(suitePaths) {
        const titles = {};

        return _(suitePaths)
            .map((path) => {
                const mocha = this._createInsistantMochaRunner(path, titles);

                qUtils.passthroughEvent(mocha, this, _.values(RunnerEvents.getSync()));

                return mocha.run();
            })
            .thru(utils.waitForResults)
            .value();
    }

    buildSuiteTree(suitePaths) {
        return this._createInsistantMochaRunner(suitePaths, {}).initMocha().suite;
    }

    _createInsistantMochaRunner(suitePaths, titles) {
        const injectors = {testSkipper: this._testSkipper, titles};

        return InsistantMochaRunner.create(suitePaths, this._browserAgent, this._config, injectors);
    }
};
