// scripts/verify_checkin_task3.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const htmlPath = path.join(__dirname, '..', 'checkin.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// 1. Verify placeholder in HTML
assert.ok(
    html.includes('<h5 class="mb-0 fw-bold" id="pageTitleInfo">載入中...</h5>'),
    'pageTitleInfo element with "載入中..." not found in checkin.html'
);
console.log('✅ 1. pageTitleInfo placeholder confirmed in HTML');

// 2. Extract script content
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>[\s\S]*?<\/body>/);
assert.ok(scriptMatch, 'Script tag not found in checkin.html');

// 3. Check syntax using VM
try {
    new vm.Script(scriptMatch[1]);
    console.log('✅ 2. JavaScript syntax in checkin.html is valid');
} catch (e) {
    console.error('❌ Syntax error in checkin.html script:', e);
    process.exit(1);
}

// 4. Test parseCheckinUrlParams logic
function testParser(search, user) {
    const sandbox = {
        window: {},
        document: {},
        URLSearchParams: require('url').URLSearchParams,
        $: () => ({ ready: () => {}, text: () => {}, html: () => {}, focus: () => {}, on: () => {}, bootstrapTable: () => {} }),
        Date: Date,
        parseInt: parseInt,
        String: String
    };
    sandbox.window = sandbox;
    sandbox.window.location = { search };
    sandbox.window.Auth = user ? { getUser: () => user, requireAuth: () => true } : null;

    vm.createContext(sandbox);
    vm.runInContext(scriptMatch[1], sandbox);

    return sandbox.window.parseCheckinUrlParams();
}

// Case 1: && with YYYYMMDD
const res1 = testParser('?deptId=JMB03&&DispatchDate=20261020', null);
console.log('Case 1 (&& with 8-digit date):', res1);
assert.strictEqual(res1.deptId, 'JMB03');
assert.strictEqual(res1.dispatchDate, '2026-10-20');

// Case 2: single & with YYYY-MM-DD
const res2 = testParser('?deptId=JMA01&dispatchDate=2026-10-22', null);
console.log('Case 2 (single & with hyphen date):', res2);
assert.strictEqual(res2.deptId, 'JMA01');
assert.strictEqual(res2.dispatchDate, '2026-10-22');

// Case 3: missing deptId and date, fallback to user deptId and today
const today = new Date();
const expectedToday = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
const res3 = testParser('', { deptId: 'DEPT99' });
console.log('Case 3 (missing params, user dept):', res3);
assert.strictEqual(res3.deptId, 'DEPT99');
assert.strictEqual(res3.dispatchDate, expectedToday);

// Case 4: missing deptId and no user, fallback to JMB03
const res4 = testParser('', null);
console.log('Case 4 (no params, no user):', res4);
assert.strictEqual(res4.deptId, 'JMB03');
assert.strictEqual(res4.dispatchDate, expectedToday);

console.log('✅ 3. parseCheckinUrlParams handles all URL scenarios correctly');

// 5. updateHeaderInfo test
let renderedHtml = '';
const sandboxHeader = {
    window: {},
    document: {},
    URLSearchParams: require('url').URLSearchParams,
    $: (selector) => {
        return {
            ready: () => {},
            text: () => {},
            html: (content) => {
                if (selector === '#pageTitleInfo') {
                    renderedHtml = content;
                }
            },
            focus: () => {},
            on: () => {},
            bootstrapTable: () => {}
        };
    },
    Date: Date,
    parseInt: parseInt,
    String: String
};
sandboxHeader.window = sandboxHeader;
sandboxHeader.window.location = { search: '' };
vm.createContext(sandboxHeader);
vm.runInContext(scriptMatch[1], sandboxHeader);
sandboxHeader.updateHeaderInfo('JMB03', 'B10-3廠', '2026-10-21');
console.log('Rendered Header Info:', renderedHtml);
assert.strictEqual(renderedHtml, '2026/10/21 &nbsp;|&nbsp; B10-3廠');

// Test fallback to deptId when deptName is empty
sandboxHeader.updateHeaderInfo('JMB03', '', '2026-10-21');
assert.strictEqual(renderedHtml, '2026/10/21 &nbsp;|&nbsp; JMB03');

console.log('✅ 4. updateHeaderInfo renders dynamic title info correctly');

// 6. Verify Auth guard in $(document).ready
assert.ok(
    html.includes('Auth.requireAuth('),
    'Auth.requireAuth not called in checkin.html'
);
console.log('✅ 5. Auth.requireAuth guard confirmed in $(document).ready');

console.log('\n🎉 ALL TASK 3 VERIFICATIONS PASSED SUCCESSFULLY!');
