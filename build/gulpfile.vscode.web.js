/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');

const noop = () => { return Promise.resolve(); };

gulp.task('vscode-web-standalone', noop);
gulp.task('vscode-web-standalone-min', noop);
gulp.task('vscode-web-standalone-ci', noop);
gulp.task('vscode-web-standalone-min-ci', noop);