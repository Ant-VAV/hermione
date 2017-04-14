'use strict';

const q = require('q');
const _ = require('lodash');
const EventEmitter = require('events').EventEmitter;
const Runnable = require('./runnable');
const Test = require('./test');

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
        return this.title;
    }

    beforeAll(cb) {
        return this._createHook({
            title: 'before all',
            collection: this.beforeAllHooks,
            event: 'beforeAll',
            cb
        });
    }

    beforeEach(cb) {
        return this._createHook({
            title: 'before each',
            collection: this.beforeEachHooks,
            event: 'beforeEach',
            cb
        });
    }

    afterEach(cb) {
        return this._createHook({
            title: 'after each',
            collection: this.afterEachHooks,
            event: 'afterEach',
            cb
        });
    }

    afterAll(cb) {
        return this._createHook({
            title: 'after all',
            collection: this.afterAllHooks,
            event: 'afterAll',
            cb
        });
    }

    _createHook(props) {
        const hook = Runnable.create(this);
        hook.title = props.title;
        hook.fn = props.cb;

        props.collection.push(hook);
        this.emit(props.event, hook);
        return this;
    }

    addTest(title, callback, options) {
        callback = callback || _.noop;
        options = _.defaults(options || {}, {skipped: false, file: null});

        const test = Test.create(this);
        test.fn = callback;
        test.title = title;
        test.file = options.file;
        test.pending = options.skipped;

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

    eachTest(fn) {
        this.tests.forEach(fn);
    }

    enableTimeouts() {

    }

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
                    .catch((error) => this.emit('fail', {error, test}))
                    .then(this._execRunnables(this.afterEachHooks));
            }, q()))
            .then(this._execRunnables(this.suites, []))
            .then(this._execRunnables(this.afterAllHooks));
    }

    _execRunnables(runnables) {
        return () => runnables.reduce((acc, runnable) => {
            return acc
                .then(() => runnable.run())
                .catch((error) => this.emit('fail', {error, runnable}));
        }, q());
    }
};
