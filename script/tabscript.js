document.addEventListener('DOMContentLoaded', function () {
    const tabs = document.querySelectorAll('.tab');
    const tabPages = document.querySelectorAll('.tab-page');

    tabs.forEach(tab => {
        tab.addEventListener('click', function () {
            const tabId = this.dataset.tab;

            // Deactivate all tabs and tab pages
            tabs.forEach(tab => tab.classList.remove('active'));
            tabPages.forEach(tabPage => tabPage.classList.remove('active'));

            // Activate the clicked tab and corresponding tab page
            this.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
});
