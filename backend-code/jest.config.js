module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/unit/**/*.unit.test.js'],
    clearMocks: true,
    collectCoverageFrom: ['auth/handlers/**/*.js', 'auth/lib/**/*.js'],
}
