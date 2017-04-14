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

    fullTitle() {
        return `${this.parent.title} ${this.title}`;
    }

    beforeAll(cb) {
        return this._createHook({
            title: 'before all',
            collection: this._beforeAll,
            event: 'beforeAll',
            cb
        });
    }

    beforeEach(cb) {
        return this._createHook({
            title: 'before each',
            collection: this._beforeEach,
            event: 'beforeEach',
            cb
        });
    }

    afterEach(cb) {
        return this._createHook({
            title: 'after each',
            collection: this._afterEach,
            event: 'afterEach',
            cb
        });
    }

    afterAll(cb) {
        return this._createHook({
            title: 'after all',
            collection: this._afterAll,
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

    addTest(options) {
        options = options || {};

        const test = Test.create(this);

        test.title = options.title || 'some-test';
        test.fn = options.cb || _.noop;
        test.file = options.file || null;
        test.pending = options.skipped || false;

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

    enableTimeouts() {}

    run() {
        return q()
            .then(this._execRunnables(this._beforeAll))
            .then(() => this.tests.reduce((acc, test) => {
                return acc
                    .then(() => {
                        const setContextToHook = (hook) => hook.ctx.currentTest = test;

                        this._beforeEach.forEach(setContextToHook);
                        this._afterEach.forEach(setContextToHook);
                    })
                    .then(this._execRunnables(this._beforeEach))
                    .then(() => test.run())
                    .catch((error) => this.emit('fail', {error, test}))
                    .then(this._execRunnables(this._afterEach));
            }, q()))
            .then(this._execRunnables(this.suites, []))
            .then(this._execRunnables(this._afterAll));
    }

    _execRunnables(runnables) {
        return () => runnables.reduce((acc, runnable) => {
            return acc
                .then(() => runnable.run())
                .catch((error) => this.emit('fail', {error, runnable}));
        }, q());
    }
};
