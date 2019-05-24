import { Selector } from 'testcafe';
import { ClientFunction } from 'testcafe';

const getAllCharts = ClientFunction(() => allCharts);

fixture `Page build`
    .page `../index.html?branch=test-data&meta=test.tsv`;

test('Test basic page build', async t => {
    // test for the allCharts getting populated, i.e. until initCrossfilter if
    // finished
    await t
        .expect(getAllCharts()).ok();
});
