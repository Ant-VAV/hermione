'use strict';

const q = require('q');
const EventEmitter = require('events').EventEmitter;
const Runnable = require('./runnable');
const Test = require('./test');

const EVENTS = {
    TEST_FAIL: 'TEST_FAIL',
    RUNNABLE_FAIL: 'RUNNABLE_FAIL'
};

module.exports = class Suite extends EventEmitter {
    constructor(parent) {
        super();

        this.parent = parent;
        this.title = 'suite-title';

        this._beforeAll = [];
        this._beforeEach = [];
        this._afterEach = [];
        this._afterAll = [];
        this._tests = [];
        this._suites = [];

        this.ctx = {};
    }

    static create(parent) {
        return new this(parent);
    }

    get tests() {
        return this._tests;
    }

    get suites() {
        return this._suites;
    }

    get beforeAllHooks() {
        return this._beforeAll;
    }

    get beforeEachHooks() {
        return this._beforeEach;
    }

    get afterEachHooks() {
        return this._afterEach;
    }

    get afterAllHooks() {
        return this._afterAll;
    }

    fullTitle() {
        return `${this.parent.title} ${this.title}`;
    }

    beforeAll(fn) {
        return this._createHook({
            title: 'before all',
            collection: this._beforeAll,
            event: 'beforeAll',
            fn
        });
    }

    beforeEach(fn) {
        return this._createHook({
            title: 'before each',
            collection: this._beforeEach,
            event: 'beforeEach',
            fn
        });
    }

    afterEach(fn) {
        return this._createHook({
            title: 'after each',
            collection: this._afterEach,
            event: 'afterEach',
            fn
        });
    }

    afterAll(fn) {
        return this._createHook({
            title: 'after all',
            collection: this._afterAll,
            event: 'afterAll',
            fn
        });
    }

    _createHook(options) {
        const hook = Runnable.create(this, options);
        options.collection.push(hook);
        this.emit(options.event, hook);
        return this;
    }

    addTest(options) {
        let test;

        if (options instanceof Test) {
            test = options;
            test.parent = this;
        } else {
            test = Test.create(this, options);
        }

        this.tests.push(test);
        this.emit('test', test);

        return this;
    }

    addSuite(suite) {
        suite.parent = this;
        this.suites.push(suite);
        this.emit('suite', suite);
        return this;
    }

    subscribeOnTestFail(cb) {
        this.on(EVENTS.TEST_FAIL, cb);
        return this;
    }

    subscribeOnRunnableFail(cb) {
        this.on(EVENTS.RUNNABLE_FAIL, cb);
        return this;
    }

    eachTest(fn) {
        this.tests.forEach(fn);
    }

    enableTimeouts() {}

    run() {
        return q()
            .then(this._execRunnables(this.beforeAllHooks))
            .then(() => this.tests.reduce((acc, test) => {
                return acc
                    .then(() => {
                        const setContextToHook = (hook) => hook.ctx.currentTest = test;

                        this.beforeEachHooks.forEach(setContextToHook);
                        this.afterEachHooks.forEach(setContextToHook);
                    })
                    .then(this._execRunnables(this.beforeEachHooks))
                    .then(() => test.run())
                    .catch((error) => this.emit(EVENTS.TEST_FAIL, {error, test}))
                    .then(this._execRunnables(this.afterEachHooks));
            }, q()))
            .then(this._execRunnables(this.suites, []))
            .then(this._execRunnables(this.afterAllHooks));
    }

    _execRunnables(runnables) {
        return () => runnables.reduce((acc, runnable) => {
            return acc
                .then(() => runnable.run())
                .catch((error) => this.emit(EVENTS.RUNNABLE_FAIL, {error, runnable}));
        }, q());
    }
};
