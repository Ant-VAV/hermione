'use strict';

const Runnable = require('./runnable');

module.exports = class Test extends Runnable {
    constructor(parent) {
        super(parent);

        this.title = 'default-title';

        this.file = null;
        this.pending = false;
    }
};
