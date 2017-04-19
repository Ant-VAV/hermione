'use strict';

const Suite = require('./suite');
const Test = require('./test');

class Mocha {
    constructor(options) {
        this._suite = Suite.create();
        this.constructor._instance = this;

        this.addFile = sinon.stub();
        this.loadFiles = sinon.stub();
        this.reporter = sinon.stub();
        this.fullTrace = sinon.stub();

        this.constructorArgs = options;
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
}

module.exports = Mocha;
