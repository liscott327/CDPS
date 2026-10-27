const fs = require('fs');
const path = require('path');
const assert = require('assert');

const htmlPath = path.join(__dirname, '..', 'checkin.html');
const content = fs.readFileSync(htmlPath, 'utf8');

console.log('Testing checkin.html modifications...');

// 1. Verify abnormal-table columns do NOT have action column
const abnormalIndex = content.indexOf("$('#abnormal-table').bootstrapTable({");
assert(abnormalIndex !== -1, 'abnormal-table bootstrapTable initialization not found');
const abnormalSection = content.substring(abnormalIndex, abnormalIndex + 800);
assert(!abnormalSection.includes("field: 'action'"), 'abnormal-table should NOT have action column');
assert(!abnormalSection.includes("abnormalActionFormatter"), 'abnormal-table should NOT use abnormalActionFormatter');
console.log('✓ abnormal-table columns do not include action or abnormalActionFormatter');

// 2. Verify not-checked-in-table still has action column
const notCheckedIndex = content.indexOf("$('#not-checked-in-table').bootstrapTable({");
assert(notCheckedIndex !== -1, 'not-checked-in-table bootstrapTable initialization not found');
const notCheckedSection = content.substring(notCheckedIndex, notCheckedIndex + 800);
assert(notCheckedSection.includes("field: 'action'"), 'not-checked-in-table should still have action column');
console.log('✓ not-checked-in-table retains action column');

// 3. Verify abnormalReasonFormatter logic
assert(content.includes('var isInvalid = !reasonText || !reasonText.trim();'), 'abnormalReasonFormatter isInvalid check missing');
assert(content.includes('var invalidClass = isInvalid ? \' is-invalid border-danger\' : \'\';'), 'invalidClass missing');
console.log('✓ abnormalReasonFormatter correctly includes is-invalid border-danger when empty');

// 4. Verify onReasonTextInput logic
assert(content.includes("$(inputEl).addClass('is-invalid border-danger');"), 'onReasonTextInput addClass missing');
assert(content.includes("$(inputEl).removeClass('is-invalid border-danger');"), 'onReasonTextInput removeClass missing');
console.log('✓ onReasonTextInput dynamically adds/removes is-invalid border-danger');

// 5. Verify saveAllAbnormal validation
assert(content.includes('if (hasEmpty) {'), 'saveAllAbnormal hasEmpty check missing');
assert(content.includes('請填寫所有人員的異常原因後再進行儲存！'), 'saveAllAbnormal validation message missing');
console.log('✓ saveAllAbnormal validates and blocks saving if empty reason exists');

// 6. Test syntax of script tags
const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
let match;
let scriptIndex = 0;
while ((match = scriptRegex.exec(content)) !== null) {
    const scriptContent = match[1];
    if (scriptContent.trim() && !match[0].includes('src=')) {
        scriptIndex++;
        try {
            new Function(scriptContent);
            console.log(`✓ Inline script #${scriptIndex} syntax is valid`);
        } catch (err) {
            console.error(`✗ Inline script #${scriptIndex} syntax error:`, err);
            process.exit(1);
        }
    }
}

console.log('All verifications PASSED successfully!');
