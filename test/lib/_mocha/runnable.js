'use strict';

const _ = require('lodash');

module.exports = class Runnable {
    constructor(parent) {
        this.title = '';
        this.fn = _.noop;
        this.parent = parent;
        this.ctx = {};
    }

    static create(parent) {
        return new this(parent);
    }

    fullTitle() {
        return `${this.parent.title} ${this.title}`;
    }

    run() {
        return this.fn();
    }
};
