'use strict';

const BrowserAgent = require('../../../../lib/browser-agent');
const logger = require('../../../../lib/utils').logger;
const ProxyReporter = require('../../../../lib/runner/mocha-runner/proxy-reporter');
const SkipBuilder = require('../../../../lib/runner/mocha-runner/skip/skip-builder');
const OnlyBuilder = require('../../../../lib/runner/mocha-runner/skip/only-builder');
const Skip = require('../../../../lib/runner/mocha-runner/skip/');
const TestSkipper = require('../../../../lib/runner/test-skipper');
const RunnerEvents = require('../../../../lib/constants/runner-events');
const MochaStub = require('../../_mocha');
const proxyquire = require('proxyquire').noCallThru();
const EventEmitter = require('events').EventEmitter;
const _ = require('lodash');
const q = require('q');

describe('mocha-runner/mocha-adapter', () => {
    const sandbox = sinon.sandbox.create();

    let MochaAdapter;
    let browserAgent;
    let clearRequire;
    let testSkipper;

    const mkMochaAdapter_ = (opts, ctx) => {
        return MochaAdapter.create(opts || {}, browserAgent, ctx);
    };

    const mkBrowserStub_ = () => {
        return {publicAPI: Object.create({})};
    };

    beforeEach(() => {
        testSkipper = sinon.createStubInstance(TestSkipper);
        browserAgent = sinon.createStubInstance(BrowserAgent);

        clearRequire = sandbox.stub().named('clear-require');
        MochaAdapter = proxyquire('../../../../lib/runner/mocha-runner/mocha-adapter', {
            'clear-require': clearRequire,
            'mocha': MochaStub
        });

        sandbox.stub(logger);
    });

    afterEach(() => sandbox.restore());

    describe('init', () => {
        it('should add an empty hermione object to global', () => {
            MochaAdapter.init();

            assert.deepEqual(global.hermione, {});

            delete global.hermione;
        });
    });

    describe('constructor', () => {
        it('should pass shared opts to mocha instance', () => {
            mkMochaAdapter_({grep: 'foo'});

            assert.deepEqual(MochaStub.getInstance().constructorArgs, {grep: 'foo'});
        });

        it('should enable full stacktrace in mocha', () => {
            mkMochaAdapter_();

            assert.called(MochaStub.getInstance().fullTrace);
        });
    });

    describe('addFiles', () => {
        it('should add files', () => {
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter.addFiles(['path/to/file']);

            assert.calledOnce(MochaStub.getInstance().addFile);
            assert.calledWith(MochaStub.getInstance().addFile, 'path/to/file');
        });

        it('should clear require cache for file before adding', () => {
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter.addFiles(['path/to/file']);

            assert.calledWithMatch(clearRequire, 'path/to/file');
            assert.callOrder(clearRequire, MochaStub.getInstance().addFile);
        });

        it('should load files after add', () => {
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter.addFiles(['path/to/file']);

            assert.calledOnce(MochaStub.getInstance().loadFiles);
            assert.callOrder(MochaStub.getInstance().addFile, MochaStub.getInstance().loadFiles);
        });

        describe('hermione global', () => {
            beforeEach(() => MochaAdapter.init());
            afterEach(() => delete global.hermione);

            it('hermione.skip should return SkipBuilder instance', () => {
                mkMochaAdapter_();

                assert.instanceOf(global.hermione.skip, SkipBuilder);
            });

            it('hermione.only should return OnlyBuilder instance', () => {
                mkMochaAdapter_();

                assert.instanceOf(global.hermione.only, OnlyBuilder);
            });

            it('hermione.ctx should return passed ctx', () => {
                mkMochaAdapter_({}, {some: 'ctx'});

                assert.deepEqual(global.hermione.ctx, {some: 'ctx'});
            });
        });
    });

    describe('inject browser', () => {
        beforeEach(() => {
            browserAgent.getBrowser.returns(q(mkBrowserStub_()));
            browserAgent.freeBrowser.returns(q());
        });

        it('should request browser before suite execution', () => {
            mkMochaAdapter_();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => suite.addTest('some-test'))
                .run()
                .then(() => assert.calledOnce(browserAgent.getBrowser));
        });

        it('should not request browsers for suite with one skipped test', () => {
            mkMochaAdapter_();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => suite.addTest({skipped: true}))
                .run()
                .then(() => assert.notCalled(browserAgent.getBrowser));
        });

        it('should request browsers for suite with at least one non-skipped test', () => {
            mkMochaAdapter_();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => {
                    return suite
                        .addTest('some-skipped-title', _.noop, {skipped: true})
                        .addTest('some-title');
                })
                .run()
                .then(() => assert.calledOnce(browserAgent.getBrowser));
        });

        it('should not request browsers for suite with nested skipped tests', () => {
            mkMochaAdapter_();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => {
                    return suite
                        .addSuite(
                            MochaStub.Suite.create(suite)
                                .addTest({skipped: true})
                                .addTest({skipped: true})
                        );
                })
                .run()
                .then(() => assert.notCalled(browserAgent.getBrowser));
        });

        it('should release browser after suite execution', () => {
            const browser = mkBrowserStub_();
            browserAgent.getBrowser.returns(q(browser));
            browserAgent.freeBrowser.returns(q());

            mkMochaAdapter_();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => suite.addTest('some-title'))
                .run()
                .then(() => {
                    assert.calledOnce(browserAgent.freeBrowser);
                    assert.calledWith(browserAgent.freeBrowser, browser);
                });
        });

        it('should disable mocha timeouts while setting browser hooks', () => {
            sandbox.stub(MochaStub.Suite.prototype, 'enableTimeouts').onFirstCall().returns(true);
            const beforeAllStub = sandbox.stub(MochaStub.Suite.prototype, 'beforeAll');
            const afterAllStub = sandbox.stub(MochaStub.Suite.prototype, 'afterAll');

            mkMochaAdapter_();

            assert.callOrder(
                MochaStub.Suite.prototype.enableTimeouts, // get current value of enableTimeouts
                MochaStub.Suite.prototype.enableTimeouts.withArgs(false).named('disableTimeouts'),
                beforeAllStub,
                afterAllStub,
                MochaStub.Suite.prototype.enableTimeouts.withArgs(true).named('restoreTimeouts')
            );
        });

        it('should not be rejected if freeBrowser failed', () => {
            const browser = mkBrowserStub_();

            browserAgent.getBrowser.returns(q(browser));
            browserAgent.freeBrowser.returns(q.reject('some-error'));

            mkMochaAdapter_();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => suite.addTest('some-title'))
                .run()
                .then(() => {
                    assert.calledOnce(logger.warn);
                    assert.calledWithMatch(logger.warn, /some-error/);
                });
        });
    });

    describe('inject skip', () => {
        beforeEach(() => {
            browserAgent.getBrowser.returns(q(mkBrowserStub_()));
            browserAgent.freeBrowser.returns(q());
            sandbox.stub(Skip.prototype, 'handleEntity');
        });

        it('should apply skip to test', () => {
            mkMochaAdapter_();

            const test = new MochaStub.Test();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => suite.addTest(test))
                .run()
                .then(() => {
                    assert.called(Skip.prototype.handleEntity);
                    assert.calledWith(Skip.prototype.handleEntity, test);
                });
        });

        it('should apply skip to suite', () => {
            mkMochaAdapter_();

            let nestedSuite;

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => {
                    nestedSuite = MochaStub.Suite.create(suite);
                    return suite.addSuite(nestedSuite);
                })
                .run()
                .then(() => {
                    assert.called(Skip.prototype.handleEntity);
                    assert.calledWith(Skip.prototype.handleEntity, nestedSuite);
                });
        });
    });

    describe('applySkip', () => {
        it('should skip suite using test skipper', () => {
            const mochaAdapter = mkMochaAdapter_();
            browserAgent.browserId = 'some-browser';

            mochaAdapter.applySkip(testSkipper);

            assert.calledWith(testSkipper.applySkip, MochaStub.getInstance().suite, 'some-browser');
        });

        it('should be chainable', () => {
            const mochaAdapter = mkMochaAdapter_();
            const mochaInstance = mochaAdapter.applySkip(testSkipper);

            assert.instanceOf(mochaInstance, MochaAdapter);
        });
    });

    describe('inject execution context', () => {
        let browser;

        beforeEach(() => {
            browser = mkBrowserStub_();
            browserAgent.getBrowser.returns(q(browser));
            browserAgent.freeBrowser.returns(q());
        });

        it('should add execution context to browser', () => {
            mkMochaAdapter_();

            const test = new MochaStub.Test();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => suite.addTest(test))
                .run()
                .then(() => {
                    assert.includeMembers(_.keys(browser.publicAPI.executionContext), _.keys(test));
                });
        });

        it('should handle nested tests', () => {
            mkMochaAdapter_();

            let nestedSuite;
            let nestedSuiteTest;

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => {
                    nestedSuite = MochaStub.Suite.create(suite);
                    suite.addSuite(nestedSuite);

                    nestedSuiteTest = new MochaStub.Test();
                    nestedSuite.addTest(nestedSuiteTest);
                    return suite;
                })
                .run()
                .then(() => {
                    assert.includeMembers(
                        _.keys(browser.publicAPI.executionContext),
                        _.keys(nestedSuiteTest)
                    );
                });
        });

        it('should add browser id to the context', () => {
            BrowserAgent.prototype.browserId = 'some-browser';

            mkMochaAdapter_();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => suite.addTest('some-title'))
                .run()
                .then(() => {
                    assert.property(browser.publicAPI.executionContext, 'browserId', 'some-browser');
                });
        });

        it('should add execution context to the browser prototype', () => {
            BrowserAgent.prototype.browserId = 'some-browser';

            mkMochaAdapter_();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => suite.addTest('some-title'))
                .run()
                .then(() => assert.property(Object.getPrototypeOf(browser.publicAPI), 'executionContext'));
        });
    });

    describe('attachTestFilter', () => {
        it('should check if test should be run', () => {
            BrowserAgent.prototype.browserId = 'some-browser';

            const shouldRun = sandbox.stub().returns(true);
            const mochaAdapter = mkMochaAdapter_();
            mochaAdapter.attachTestFilter(shouldRun);

            const test = new MochaStub.Test();

            MochaStub.getInstance().updateSuiteTree((suite) => suite.addTest(test));

            assert.calledWith(shouldRun, test, 'some-browser');
        });

        it('should not remove test which expected to be run', () => {
            const shouldRun = () => true;
            const mochaAdapter = mkMochaAdapter_();
            mochaAdapter.attachTestFilter(shouldRun);

            MochaStub.getInstance().updateSuiteTree((suite) => {
                return suite
                    .addTest({title: 'test1'})
                    .addTest({title: 'test2'});
            });

            const tests = MochaStub.getInstance().suite.tests;

            assert.equal(tests[0].title, 'test1');
            assert.equal(tests[1].title, 'test2');
        });

        it('should remove test which does not suppose to be run', () => {
            const shouldRun = sandbox.stub();
            shouldRun.onFirstCall().returns(true);
            shouldRun.onSecondCall().returns(false);

            const mochaAdapter = mkMochaAdapter_();
            mochaAdapter.attachTestFilter(shouldRun);

            MochaStub.getInstance().updateSuiteTree((suite) => {
                return suite
                    .addTest({title: 'test1'})
                    .addTest({title: 'test2'});
            });

            const tests = MochaStub.getInstance().suite.tests;

            assert.lengthOf(tests, 1);
            assert.equal(tests[0].title, 'test1');
        });

        it('should not filter any test if filter function is not passed', () => {
            const mochaAdapter = mkMochaAdapter_();
            mochaAdapter.attachTestFilter();

            MochaStub.getInstance().updateSuiteTree((suite) => suite.addTest({title: 'some-test'}));

            const tests = MochaStub.getInstance().suite.tests;

            assert.lengthOf(tests, 1);
            assert.equal(tests[0].title, 'some-test');
        });
    });

    describe('attachTitleValidator', () => {
        it('should throw an error if tests have the same full title', () => {
            const mochaAdapter = mkMochaAdapter_();
            mochaAdapter.attachTitleValidator({});

            assert.throws(() => {
                MochaStub.getInstance()
                    .updateSuiteTree((suite) => {
                        return suite
                            .addTest({title: 'test-title', file: 'some/path/file.js'})
                            .addTest({title: 'test-title', file: 'other/path/file.js'});
                    });
            }, /with the same title: 'suite-title test-title'(.+) file: 'some\/path\/file.js'/);
        });
    });

    describe('attachEmitFn', () => {
        let mochaAdapter;

        beforeEach(() => {
            sandbox.stub(ProxyReporter.prototype, '__constructor');
            mochaAdapter = mkMochaAdapter_();
        });

        function attachEmitFn_(emitFn) {
            mochaAdapter.attachEmitFn(emitFn);

            const Reporter = MochaStub.getInstance().reporter.lastCall.args[0];
            new Reporter(); // eslint-disable-line no-new
        }

        it('should set mocha reporter as proxy reporter in order to proxy events to emit fn', () => {
            attachEmitFn_(sinon.spy());

            assert.calledOnce(ProxyReporter.prototype.__constructor);
        });

        it('should pass to proxy reporter emit fn', () => {
            const emitFn = sinon.spy().named('emit');

            attachEmitFn_(emitFn);

            const emit_ = ProxyReporter.prototype.__constructor.firstCall.args[0];
            emit_('some-event', {some: 'data'});

            assert.calledOnce(emitFn);
            assert.calledWith(emitFn, 'some-event', sinon.match({some: 'data'}));
        });

        it('should pass to proxy reporter getter for requested browser', () => {
            const browser = mkBrowserStub_();
            browserAgent.getBrowser.returns(q(browser));
            attachEmitFn_(sinon.spy());

            MochaStub.getInstance()
                .run()
                .then(() => {
                    const getBrowser = ProxyReporter.prototype.__constructor.lastCall.args[1];
                    assert.equal(browser, getBrowser());
                });
        });

        it('should pass to proxy reporter getter for browser id if browser not requested', () => {
            browserAgent.browserId = 'some-browser';

            attachEmitFn_(sinon.spy());

            const getBrowser = ProxyReporter.prototype.__constructor.lastCall.args[1];
            assert.deepEqual(getBrowser(), {id: 'some-browser'});
        });

        describe('if event handler throws', () => {
            const initBadHandler_ = (event, handler) => {
                const emitter = new EventEmitter();
                emitter.on(event, handler);

                attachEmitFn_(emitter.emit.bind(emitter));
                return ProxyReporter.prototype.__constructor.firstCall.args[0];
            };

            it('proxy should rethrow error', () => {
                const emit_ = initBadHandler_('foo', () => {
                    throw new Error(new Error('bar'));
                });

                assert.throws(() => emit_('foo'), /bar/);
            });

            it('run should be rejected', () => {
                const emit_ = initBadHandler_('foo', () => {
                    throw new Error('bar');
                });

                const promise = mochaAdapter.run();

                try {
                    emit_('foo');
                } catch (e) {
                    // eslint иди лесом
                }

                return assert.isRejected(promise, /bar/);
            });
        });

        describe('file events', () => {
            beforeEach(() => MochaAdapter.init());
            afterEach(() => delete global.hermione);

            _.forEach({
                'pre-require': 'BEFORE_FILE_READ',
                'post-require': 'AFTER_FILE_READ'
            }, (hermioneEvent, mochaEvent) => {
                it(`should emit ${hermioneEvent} on mocha ${mochaEvent}`, () => {
                    const emit = sinon.spy();
                    browserAgent.browserId = 'bro';

                    mochaAdapter.attachEmitFn(emit);
                    MochaStub.getInstance().suite.emit(mochaEvent, {}, '/some/file.js');

                    assert.calledOnce(emit);
                    assert.calledWith(emit, RunnerEvents[hermioneEvent], {
                        file: '/some/file.js',
                        hermione: global.hermione,
                        browser: 'bro',
                        suite: mochaAdapter.suite
                    });
                });
            });
        });
    });

    describe('"before" hook error handling', () => {
        beforeEach(() => {
            browserAgent.getBrowser.returns(q(mkBrowserStub_()));
            browserAgent.freeBrowser.returns(q());

            mkMochaAdapter_();
        });

        it('should not launch suite original test if "before" hook failed', () => {
            const testCb = sinon.spy();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => {
                    return suite
                        .beforeAll(sandbox.stub().returns(q.reject(new Error('some-error'))))
                        .addTest({fn: testCb});
                })
                .run()
                .then(() => assert.notCalled(testCb));
        });

        it('should fail suite tests with error thrown from "before" hook', () => {
            const error = new Error();
            const testFailSpy = sinon.spy();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => {
                    return suite
                        .beforeAll(sandbox.stub().returns(q.reject(error)))
                        .addTest({title: 'some-test'})
                        .subscribeOnTestFail(testFailSpy);
                })
                .run()
                .then(() => {
                    const args = testFailSpy.firstCall.args[0];
                    assert.equal(args.error, error);
                    assert.equal(args.test.title, 'some-test');
                });
        });

        it('should handle sync "before hook" errors', () => {
            const error = new Error();
            const testFailSpy = sinon.spy();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => {
                    return suite
                        .beforeAll(sandbox.stub().throws(error))
                        .addTest({title: 'some-test'})
                        .subscribeOnTestFail(testFailSpy);
                })
                .run()
                .then(() => {
                    const args = testFailSpy.firstCall.args[0];
                    assert.equal(args.error, error);
                    assert.equal(args.test.title, 'some-test');
                });
        });

        it('should not execute original "before each" hook functionality if "before" hook failed', () => {
            const beforeEachHookFn = sinon.spy();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => {
                    return suite
                        .beforeAll(sandbox.stub().returns(q.reject(new Error())))
                        .beforeEach(beforeEachHookFn)
                        .addTest();
                })
                .run()
                .then(() => assert.notCalled(beforeEachHookFn));
        });

        it('should fail test with error from "before" hook if before each hook was executed successfully', () => {
            const error = new Error();
            const hookFailSpy = sinon.spy();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => {
                    return suite
                        .beforeAll(sandbox.stub().returns(q.reject(error)))
                        .beforeAll(sandbox.stub().returns(true))
                        .addTest()
                        .subscribeOnRunnableFail(hookFailSpy);
                })
                .run()
                .then(() => {
                    const args = hookFailSpy.firstCall.args[0];
                    assert.equal(args.error, error);
                    assert.equal(args.runnable.title, 'before all');
                });
        });
    });

    describe('"before each" hook error handling', () => {
        beforeEach(() => {
            browserAgent.getBrowser.returns(q(mkBrowserStub_()));
            browserAgent.freeBrowser.returns(q());

            mkMochaAdapter_();
        });

        it('should not execute original suite test if "before each" hook failed', () => {
            const testCb = sinon.spy();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => {
                    return suite
                        .beforeEach(sandbox.stub().returns(q.reject(new Error())))
                        .addTest({fn: testCb});
                })
                .run()
                .then(() => assert.notCalled(testCb));
        });

        it('should execute original suite test if "before each" hook was executed successfully', () => {
            const testCb = sinon.spy();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => {
                    return suite
                        .beforeEach(_.noop)
                        .addTest({fn: testCb});
                })
                .run()
                .then(() => assert.called(testCb));
        });

        it('should fail test with error from "before each" hook', () => {
            const error = new Error();
            const testFailSpy = sinon.spy();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => {
                    return suite
                        .beforeEach(sandbox.stub().returns(q.reject(error)))
                        .addTest({title: 'some-test'})
                        .subscribeOnTestFail(testFailSpy);
                })
                .run()
                .then(() => {
                    const args = testFailSpy.firstCall.args[0];
                    assert.equal(args.error, error);
                    assert.equal(args.test.title, 'some-test');
                });
        });

        it('should handle sync "before each" hook errors', () => {
            const error = new Error();
            const testFailSpy = sinon.spy();

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => {
                    return suite
                        .beforeEach(sandbox.stub().throws(error))
                        .addTest({title: 'some-test'})
                        .subscribeOnTestFail(testFailSpy);
                })
                .run()
                .then(() => {
                    const args = testFailSpy.firstCall.args[0];
                    assert.equal(args.error, error);
                    assert.equal(args.test.title, 'some-test');
                });
        });

        it('should never fail beforeEach hook even it has errors', () => {
            const beforeEachHookStub = sandbox.stub().throws(new Error());
            let beforeEachHookSpy;

            return MochaStub.getInstance()
                .updateSuiteTree((suite) => {
                    suite = suite
                        .beforeEach(beforeEachHookStub)
                        .addTest();

                    beforeEachHookSpy = sinon.spy(suite.beforeEachHooks[0].fn);

                    return suite;
                })
                .run()
                .then(() => assert.doesNotThrow(beforeEachHookSpy));
        });
    });
});
