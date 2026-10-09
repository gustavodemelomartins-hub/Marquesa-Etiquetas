"""Reviewed content cannot conceal API or public-page drift."""
import copy
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('seo_audit', Path(__file__).with_name('seo-catalog-audit.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class ReviewedCategoryTests(unittest.TestCase):
    def setUp(self):
        self.url = 'https://marquesasemijoias.com.br/brincos/'
        fields = {k: {'pt': v} for k, v in {
            'description': '<p>Brincos em prata 925.</p>',
            'seo_title': 'Brincos em Prata 925 | Marquesa',
            'seo_description': 'Confira os modelos de brincos em prata 925.'}.items()}
        self.snapshot = {'categories': [{'id': 1, **copy.deepcopy(fields)}]}
        self.review = {'category_drafts': [{'id': 1, 'disposition': 'draft', 'after': fields}]}
        self.pages = {self.url: {'status': 200, 'canonical_exact': self.url,
                                **{k: v['pt'] for k, v in fields.items()}}}
        self.drafts = {'summary': {}, 'category_drafts': [
            {'id': 1, 'url': self.url, 'disposition': 'draft', 'after': {'seo_title': {'pt': 'Generic'}}}]}

    def result(self):
        audit.retain_reviewed_categories(self.drafts, self.snapshot, self.pages, self.review)
        return self.drafts['category_drafts'][0]['disposition']

    def test_exact_reviewed_api_and_public_content_preserved(self):
        self.assertEqual(self.result(), 'skipped')
        self.assertEqual(self.drafts['summary']['category_drafts'], 0)

    def test_later_api_edit_requires_review(self):
        self.snapshot['categories'][0]['description']['pt'] = '<p>Later edit</p>'
        self.assertEqual(self.result(), 'draft')

    def test_stale_public_metadata_cannot_qualify(self):
        self.pages[self.url]['seo_title'] = 'Previous title'
        self.assertEqual(self.result(), 'draft')

    def test_unavailable_page_cannot_qualify(self):
        self.pages[self.url]['status'] = 404
        self.assertEqual(self.result(), 'draft')

    def test_duplicate_review_identity_rejected(self):
        self.review['category_drafts'] *= 2
        with self.assertRaisesRegex(ValueError, 'INVALID_REVIEWED_CATEGORY_INVENTORY'):
            self.result()

if __name__ == '__main__':
    unittest.main()
