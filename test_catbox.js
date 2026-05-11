const fs = require('fs');
fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: (() => {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', Buffer.from('test'), 'test.txt');
        return form;
    })()
}).then(r => r.text()).then(console.log).catch(console.error);
