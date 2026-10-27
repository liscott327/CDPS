/**
 * CPDS 導覽列與頁面完整性自動化驗證腳本
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const pages = [
    { file: 'index.html', title: '人員跨廠支援調度單 - CPDS', activeLink: 'index.html' },
    { file: 'temporay_dispatch.html', title: '臨時調度單 - CPDS', activeLink: 'temporay_dispatch.html', expectedText: ['臨時調度清單查詢與篩選', '新增臨時調度單', '儲存並送出臨時調度單'] },
    { file: 'transfer.html', title: '人員移轉點收_列表', activeLink: 'transfer.html', expectedText: ['人員移轉點收_列表', '各廠人員移轉計劃'] },
    { file: 'checkinlist.html', activeLink: 'checkinlist.html' },
    { file: 'report.html', activeLink: 'report.html' }
];

const requiredLinks = [
    'index.html',
    'temporay_dispatch.html',
    'transfer.html',
    'checkinlist.html',
    'report.html'
];

let failed = false;

console.log('=== CPDS 導覽與獨立頁面驗證開始 ===\n');

pages.forEach(p => {
    const filePath = path.join(rootDir, p.file);
    if (!fs.existsSync(filePath)) {
        console.error(`❌ [檔案遺失] ${p.file} 不存在`);
        failed = true;
        return;
    }
    console.log(`✓ [檔案存在] ${p.file}`);

    const content = fs.readFileSync(filePath, 'utf-8');

    // 檢查 5 個導覽連結是否全數具備
    requiredLinks.forEach(link => {
        if (!content.includes(`href="${link}"`)) {
            console.error(`❌ [連結缺失] ${p.file} 未包含 href="${link}"`);
            failed = true;
        }
    });

    // 檢查 Active 狀態
    const activePattern = new RegExp(`class="[^"]*nav-link[^"]*active[^"]*"[^>]*href="${p.activeLink}"|href="${p.activeLink}"[^>]*class="[^"]*nav-link[^"]*active[^"]*"`);
    if (!activePattern.test(content)) {
        console.error(`❌ [Active狀態不正確] ${p.file} 的 ${p.activeLink} 未設定 active class`);
        failed = true;
    } else {
        console.log(`  ✓ ${p.file} 正確設定 active 於 ${p.activeLink}`);
    }

    // 檢查 Title
    if (p.title) {
        if (!content.includes(`<title>${p.title}</title>`)) {
            console.error(`❌ [Title不符] ${p.file} 未包含 <title>${p.title}</title>`);
            failed = true;
        } else {
            console.log(`  ✓ Title 正確: ${p.title}`);
        }
    }

    // 檢查特定關鍵文字
    if (p.expectedText) {
        p.expectedText.forEach(txt => {
            if (!content.includes(txt)) {
                console.error(`❌ [關鍵文字缺失] ${p.file} 缺少文字: "${txt}"`);
                failed = true;
            } else {
                console.log(`  ✓ 包含關鍵文字: "${txt}"`);
            }
        });
    }
});

console.log('\n================================');
if (failed) {
    console.error('❌ 驗證失敗，請檢查上述錯誤。');
    process.exit(1);
} else {
    console.log('✅ 所有檢驗項目完全 PASS！');
    process.exit(0);
}
