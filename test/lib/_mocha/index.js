'use strict';

const Suite = require('./suite');
const Test = require('./test');

class Mocha {
    __constructor() {
        // needs for stub ability
    }

    constructor(options) {
        this.__constructor(options);
        this._suite = Suite.create();
        this.constructor._instance = this;
    }

    static getInstance() {
        return this._instance;
    }

    static get Test() {
        return Test;
    }

    static get Suite() {
        return Suite;
    }

    run() {
        return this.suite.run().then(() => this.suite);
    }

    get suite() {
        return this._suite;
    }

    updateSuiteTree(cb) {
        this._suite = cb(this._suite);
        return this;
    }

    addFile() {
        // needs for stub ability
    }

    loadFiles() {
        // needs for stub ability
    }

    reporter() {
        // needs for stub ability
    }

    fullTrace() {
        // needs for stub ability
    }
}

module.exports = Mocha;
