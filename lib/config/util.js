'use strict';

const _ = require('lodash');
const path = require('path');
const configparser = require('gemini-configparser');

const option = configparser.option;
const map = configparser.map;

const is = exports.is = (type) => {
    return (value) => {
        if (typeof value !== type) {
            throw new Error(`value must be a ${type}`);
        }
    };
};

exports.resolveWithProjectDir = (value) => {
    return value ? path.resolve(process.cwd(), value) : value;
};

const parseBoolean = exports.parseBoolean = (value) => {
    switch (value.toLowerCase()) {
        case '1':
        case 'yes':
        case 'true':
            return true;
        case '0':
        case 'no':
        case 'false':
            return false;
        default:
            throw new Error(`Unexpected value for boolean option ${value}`);
    }
};

exports.booleanOption = (defaultValue) => {
    return option({
        parseCli: parseBoolean,
        parseEnv: parseBoolean,
        validate: is('boolean'),
        defaultValue
    });
};

exports.positiveIntegerOption = (defaultValue) => {
    return option({
        parseEnv: Number,
        parseCli: Number,
        defaultValue,
        validate: (value) => {
            if (!Number.isInteger(value)) {
                throw new Error('Field must be an integer number');
            } else if (value <= 0) {
                throw new Error('Field must be positive');
            }
        }
    });
};

exports.nonNegativeIntegerOption = (defaultValue) => {
    return option({
        parseEnv: Number,
        parseCli: Number,
        defaultValue,
        validate: (value) => {
            if (!Number.isInteger(value)) {
                throw new Error('Field must be an integer number');
            } else if (value < 0) {
                throw new Error('Field must be non-negative');
            }
        }
    });
};

exports.anyObject = () => map(option({}));

exports.isOptionalFunction = (value) => _.isNull(value) || _.isFunction(value);

exports.isOptionalObject = (value) => _.isNull(value) || _.isPlainObject(value);
