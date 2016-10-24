'use strict';

const Assert = require('chai').assert;
const request = require('../support/request');

module.exports = function server() {
    // eslint-disable-next-line new-cap
    this.Before({
        tags: ['@secrets']
    }, () => {
        this.repoOrg = 'screwdriver-cd-test';
        this.repoName = 'functional-secrets';
        this.pipelineId = null;
    });

    this.Given(/^an existing repository for secret with these users and permissions:$/,
        { timeout: 60 * 1000 }, table =>
        this.getJwt(this.accessKey)
        .then((response) => {
            this.jwt = response.body.token;

            return request({
                uri: `${this.instance}/${this.namespace}/pipelines`,
                method: 'POST',
                auth: {
                    bearer: this.jwt
                },
                body: {
                    checkoutUrl: `git@github.com:${this.repoOrg}/${this.repoName}.git#master`
                },
                json: true
            });
        })
        .then((res) => {
            this.pipelineId = res.body.id;

            Assert.strictEqual(res.statusCode, 201);

            return table;
        })
    );

    this.Given(/^an existing pipeline with that repository with the workflow:$/, table => table);

    this.When(/^a secret "foo" is added globally$/, () =>
        request({
            uri: `${this.instance}/${this.namespace}/secrets`,
            method: 'POST',
            body: {
                pipelineId: this.pipelineId,
                name: 'FOO',
                value: 'secrets',
                allowInPR: false
            },
            auth: {
                bearer: this.jwt
            },
            json: true
        }).then((response) => {
            this.secretId = response.body.id;
            Assert.equal(response.statusCode, 201);
        })
    );

    this.When(/^the "main" job is started$/, { timeout: 60 * 1000 }, () =>
        request({
            uri: `${this.instance}/${this.namespace}/pipelines/${this.pipelineId}/jobs`,
            method: 'GET',
            json: true
        }).then((response) => {
            this.jobId = response.body[0].id;
            this.secondJobId = response.body[1].id;

            Assert.equal(response.statusCode, 200);
        })
        .then(() =>
            request({
                uri: `${this.instance}/${this.namespace}/builds`,
                method: 'POST',
                body: {
                    jobId: this.jobId
                },
                auth: {
                    bearer: this.jwt
                },
                json: true
            }).then((resp) => {
                this.buildId = resp.body.id;

                Assert.equal(resp.statusCode, 201);
            })
        )
    );

    this.Then(/^the "foo" secret should be available in the build$/, { timeout: 60 * 1000 }, () =>
        this.waitForBuild(this.buildId).then((response) => {
            Assert.equal(response.body.status, 'SUCCESS');
            Assert.equal(response.statusCode, 200);
        })
    );

    this.When(/^the "second" job is started$/, { timeout: 60 * 1000 }, () =>
        request({
            uri: `${this.instance}/${this.namespace}/jobs/${this.secondJobId}/builds`,
            method: 'GET',
            json: true
        }).then((response) => {
            this.secondBuildId = response.body[0].id;

            return this.waitForBuild(this.secondBuildId).then((resp) => {
                Assert.equal(resp.body.status, 'SUCCESS');
                Assert.equal(resp.statusCode, 200);
            });
        })
    );

    this.Then(/^the user can view the secret exists$/, () =>
        request({
            uri: `${this.instance}/${this.namespace}/secrets/${this.secretId}`,
            method: 'GET',
            auth: {
                bearer: this.jwt
            },
            json: true
        }).then((response) => {
            Assert.isNotNull(response.body.name);
            Assert.equal(response.statusCode, 200);
        })
    );

    this.Then(/^the user can not view the secret exists$/, () =>
        request({
            uri: `${this.instance}/${this.namespace}/secrets/${this.secretId}`,
            method: 'GET',
            auth: {
                bearer: this.jwt
            },
            json: true
        }).then((response) => {
            Assert.equal(response.statusCode, 403);
        })
    );

    this.Then(/^the user can not view the value$/, () =>
        request({
            uri: `${this.instance}/${this.namespace}/jobs/${this.secondJobId}/builds`,
            method: 'GET',
            auth: {
                bearer: this.jwt
            },
            json: true
        }).then((response) => {
            Assert.isUndefined(response.body.value);
            Assert.equal(response.statusCode, 200);
        })
    );

    // eslint-disable-next-line new-cap
    this.After({
        tags: ['@secrets']
    }, () =>
        request({
            method: 'DELETE',
            auth: {
                bearer: this.jwt
            },
            url: `${this.instance}/${this.namespace}/pipelines/${this.pipelineId}`,
            followAllRedirects: true,
            json: true
        })
        .then((resp) => {
            Assert.strictEqual(resp.statusCode, 204);
        })
    );
};