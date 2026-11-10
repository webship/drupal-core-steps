// The run configuration of this repository's own suite, and the block a project
// that installs @webship-js/drupal-core-steps copies into its cucumber.js: the
// `worldParameters` below are the settings the pack reads (see README, "Settings").
//
// Note on `timeout`: webship-js sets the step timeout itself when it loads
// (45 seconds, so a locator failure reaches its friendly message before
// cucumber's own timeout). A `timeout` key here is ignored; raise or lower it
// with WEBSHIP_STEP_TIMEOUT=<milliseconds>.
module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',          // Webship-js core step definitions (auto HTML report on exit; disable: WEBSHIP_REPORT_DISABLE=1).
      // 'node_modules/webship-js/tests/step-definitions-diffy/**/*.js', // Diffy step definitions (optional).
      'tests/step-definitions/**/*.js',                                  // This pack (a project lists node_modules/@webship-js/drupal-core-steps/tests/step-definitions/**/*.js instead).
    ],
    // FEATURES=tests/features/login.feature,tests/features/logout.feature runs a subset.
    paths: process.env.FEATURES ? process.env.FEATURES.split(',') : ['tests/features/**/*.feature'],
    // Scenarios marked work-in-progress or auth-state setup stay out of the default run.
    tags: process.env.CUCUMBER_TAGS || 'not @wip and not @auth-setup',
    format: [
      '@cucumber/pretty-formatter',
      'json:tests/reports/cucumber_report.json',
    ],
    formatOptions: {
      theme: {
        'feature keyword': ['bold', 'blue'],
        'feature name': ['blue', 'underline'],
        'feature description': ['blueBright'],
        'scenario keyword': ['bold', 'magenta'],
        'scenario name': ['magenta', 'underline'],
        'step keyword': ['bold', 'green'],
        'step text': ['greenBright', 'italic'],
      },
    },
    worldParameters: {
      // The site under test. DDEV exports DDEV_PRIMARY_URL inside its containers.
      launchUrl: process.env.LAUNCH_URL || process.env.DDEV_PRIMARY_URL || 'http://localhost:8080',

      // ---------------------------------------------------------------------
      // Users registry: the accounts "I am a logged in user with the "<handle>"
      // user" logs in as. Keys are the handles feature files use; each entry
      // holds the real username and password, read from the environment so no
      // credential lives in a feature file or in version control. A Drupal core
      // Standard install has the "administrator" and "content editor" roles;
      // "authenticated" is an account with no role at all, for the scenarios
      // that prove a plain login does not reach the back end.
      // ---------------------------------------------------------------------
      users: {
        admin: {
          username: process.env.DRUPAL_ADMIN_USER || 'admin',
          password: process.env.DRUPAL_ADMIN_PASS || 'admin',
          email: process.env.DRUPAL_ADMIN_MAIL || 'admin@example.com',
        },
        editor: {
          username: process.env.DRUPAL_EDITOR_USER || 'editor',
          password: process.env.DRUPAL_EDITOR_PASS || 'editor',
          email: process.env.DRUPAL_EDITOR_MAIL || 'editor@example.com',
        },
        authenticated: {
          username: process.env.DRUPAL_AUTHENTICATED_USER || 'authenticated',
          password: process.env.DRUPAL_AUTHENTICATED_PASS || 'authenticated',
          email: process.env.DRUPAL_AUTHENTICATED_MAIL || 'authenticated@example.com',
        },
        // Not an account: the name and email an anonymous visitor types into
        // forms that ask for them (the contact form).
        anonymous: {
          name: process.env.DRUPAL_ANONYMOUS_NAME || 'Webship QA',
          email: process.env.DRUPAL_ANONYMOUS_EMAIL || 'qa@example.com',
        },
      },

      // How long a page gets to settle after a navigation (milliseconds); the
      // hooks' values are extra waits around scenarios and steps.
      minWaitTime: {
        page: 3000,
        before_scenario: 0,
        after_scenario: 0,
        before_step: 0,
        after_step: 0,
      },

      // ---------------------------------------------------------------------
      // Named selectors. The pack merges its own preset for Drupal core's
      // markup (tests/selectors/drupal-core.json: "status message", "page
      // title", "breadcrumb", "navigation sidebar", "save button", "details",
      // "ajax throbber", "media library dialog", ...) into every scenario, so
      // `Then I see visible status message` works with nothing configured.
      // Names set here, or loaded from `files`, win over the preset.
      // ---------------------------------------------------------------------
      selectors: {
        css: {
          // 'site logo': '.site-logo',
        },
        xpath: {},
        filesPath: './tests/selectors/',
        files: [],
        offset: 60,                                  // WEBSHIP_SELECTORS_OFFSET
        breakpoints: {                               // WEBSHIP_SELECTORS_BREAKPOINTS (JSON)
          xs:   { width: 375,  height: 667  },
          sm:   { width: 576,  height: 800  },
          md:   { width: 768,  height: 1024 },
          lg:   { width: 992,  height: 768  },
          xl:   { width: 1200, height: 900, default: true },
          xxl:  { width: 1400, height: 900  },
          xxxl: { width: 1920, height: 1080 },
        },
      },

      screenshot: {
        dir: './screenshots',                        // WEBSHIP_SCREENSHOT_DIR
        purge: false,                                // WEBSHIP_SCREENSHOT_PURGE
        onFailed: true,                              // WEBSHIP_SCREENSHOT_ON_FAILED
        onEveryStep: false,                          // WEBSHIP_SCREENSHOT_ON_EVERY_STEP
        alwaysFullscreen: false,                     // WEBSHIP_SCREENSHOT_FULLSCREEN
        failedPrefix: 'failed_',                     // WEBSHIP_SCREENSHOT_FAILED_PREFIX
        filenamePattern: '{datetime}.{feature_file}.feature_{step_line}.{ext}',
        filenamePatternFailed: '{failed_prefix}{datetime}.{feature_file}.feature_{step_line}.{ext}',
        infoTypes: '',                               // WEBSHIP_SCREENSHOT_INFO_TYPES
      },

      // Video of the browser: 'off', 'on', 'on-failure' or 'tag' (only the
      // scenarios tagged @video; @no-video opts one out).
      video: {
        mode: process.env.WEBSHIP_VIDEO || 'off',
        dir: './videos',                             // WEBSHIP_VIDEO_DIR
        size: { width: 1280, height: 720 },
        filenamePattern: '{datetime}.{feature_file}.{scenario}.{status}.{ext}',
      },

      // JavaScript errors the page raises: 'warn' reports them, 'fail' fails the
      // scenario, 'off' ignores them; @js-fail, @js-warn and @js-off set it per
      // scenario (core's 403 and 404 pages log expected errors, for example).
      javascript: {
        mode: process.env.WEBSHIP_JS_ERROR_MODE || 'warn',
        levels: ['error'],                           // WEBSHIP_JS_ERROR_LEVELS (csv)
        ignore: '',                                  // WEBSHIP_JS_ERROR_IGNORE (regex)
        beforeScenario: false,                       // WEBSHIP_JS_ERROR_BEFORE
        afterScenario: true,                         // WEBSHIP_JS_ERROR_AFTER
      },

      // Diffy visual-regression (optional). Uncomment and set apiKey / projectId to enable.
      // diffy: {
      //   apiKey: '',                                 // DIFFY_API_KEY
      //   projectId: 0,                               // DIFFY_PROJECT_ID
      //   breakpoints: '640,1200',                    // DIFFY_BREAKPOINTS
      //   windowHeight: 2000,                         // DIFFY_WINDOW_HEIGHT
      //   screenshotsDir: '',                         // DIFFY_SCREENSHOTS_DIR
      //   baseUrl: 'https://app.diffy.website/api/',  // DIFFY_API_BASE_URL
      //   maxWait: 30,                                // DIFFY_MAX_WAIT (seconds)
      //   env1Url: '',                                // DIFFY_ENV1_URL
      //   env2Url: '',                                // DIFFY_ENV2_URL
      // },
    },
  },
};
