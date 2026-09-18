-- AlterEnum
-- NEWS records a notice/news list URL that the crawler links to without
-- reading its text, keeping it separate from COMMENT (text actually crawled).
ALTER TYPE "CrawlLatestCategoryKind" ADD VALUE 'NEWS' AFTER 'COMMENT';
