const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const scriptMatches = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)];
console.log('Found inline scripts:', scriptMatches.length);
scriptMatches.forEach((m, idx) => {
    try {
        new vm.Script(m[1]);
        console.log(`Script ${idx + 1} syntax OK! (Length: ${m[1].length} chars)`);
    } catch (e) {
        console.error(`Script ${idx + 1} syntax error:`, e);
        process.exit(1);
    }
});
