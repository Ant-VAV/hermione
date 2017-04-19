'use strict';

const _ = require('lodash');
const QEmitter = require('qemitter');
const qUtils = require('qemitter/utils');
const RunnerEvents = require('../../constants/runner-events');
const MochaAdapter = require('./mocha-adapter');

module.exports = class InsistantMochaRunner extends QEmitter {
    static init() {
        MochaAdapter.init();
    }

    static create(path, browserAgent, config, injectors) {
        return new InsistantMochaRunner(path, browserAgent, config, injectors);
    }

    constructor(paths, browserAgent, config, injectors) {
        super();

        this._paths = paths;
        this._browserAgent = browserAgent;
        this._system = config.system;
        this._injectors = injectors;

        this._retriesLeft = config.forBrowser(browserAgent.browserId).retry;
    }

    run(testsToRun) {
        this._tests = {
            toRun: testsToRun,
            toRetry: []
        };

        return this.initMocha().run()
            .then(() => this._retry());
    }

    initMocha() {
        const mochaAdapter = MochaAdapter.create(this._system.mochaOpts, this._browserAgent, this._system.ctx);

        qUtils.passthroughEvent(mochaAdapter, this, [
            RunnerEvents.BEFORE_FILE_READ,
            RunnerEvents.AFTER_FILE_READ,

            RunnerEvents.SUITE_BEGIN,
            RunnerEvents.SUITE_END,

            RunnerEvents.TEST_BEGIN,
            RunnerEvents.TEST_END,

            RunnerEvents.TEST_PASS,
            RunnerEvents.TEST_PENDING,

            RunnerEvents.INFO,
            RunnerEvents.WARNING
        ]);

        mochaAdapter.on(RunnerEvents.TEST_FAIL, (failed) => this._handleTestFail(failed));
        mochaAdapter.on(RunnerEvents.SUITE_FAIL, (failed) => this._handleSuiteFail(failed));
        mochaAdapter.on(RunnerEvents.ERROR, (error, failed) => this._handleError(error, failed));

        return mochaAdapter
            .attachTestFilter((test, browserId) => this._shouldRun(test, browserId))
            .attachTitleValidator(this._injectors.titles)
            .applySkip(this._injectors.testSkipper)
            .addFiles([].concat(this._paths));
    }

    _handleTestFail(failed) {
        return this._handleFail(RunnerEvents.TEST_FAIL, failed, failed.hook ? failed.hook.parent : failed);
    }

    _handleSuiteFail(failed) {
        return this._handleFail(RunnerEvents.SUITE_FAIL, failed, failed.parent);
    }

    _handleFail(event, failed, runnable) {
        if (!this._retriesLeft) {
            this.emit(event, failed);
            return;
        }

        this._addTestsToRetry(runnable, runnable.browserId);

        this.emit(RunnerEvents.RETRY, _.extend(failed, {
            retriesLeft: this._retriesLeft - 1
        }));
    }

    _handleError(error, failed) {
        if (!failed.parent || !this._retriesLeft) {
            this.emit(RunnerEvents.ERROR, error, failed);
            return;
        }

        this._addTestsToRetry(failed.parent, failed.parent.browserId);

        this.emit(RunnerEvents.RETRY, _.extend(failed, {
            retriesLeft: this._retriesLeft - 1,
            err: error
        }));
    }

    _addTestsToRetry(runnable, browserId) {
        if (runnable.type === 'test') {
            this._tests.toRetry.push(_.extend(runnable, {browserId}));
        } else {
            _.union(runnable.suites, runnable.tests).forEach((context) => this._addTestsToRetry(context, browserId));
        }
    }

    _shouldRun(test, browserId) {
        return _.isEmpty(this._tests.toRun) || _.some(this._tests.toRun, (runnable) => {
            return runnable.browserId === browserId
                && runnable.file === test.file
                && runnable.fullTitle() === test.fullTitle();
        });
    }

    _retry() {
        if (_.isEmpty(this._tests.toRetry)) {
            return;
        }

        --this._retriesLeft;
        this._injectors.titles = {}; // hack to switch off title validator on retry

        return this.run(this._tests.toRetry);
    }
};
