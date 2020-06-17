# Changelog

## 1.5.2 - 17-06-2020

### Added
- Doubled performance of scrape profile method by allowing async tasks to run asynchronously (who'd have thought?)

### Changed
- Updated video_control html identifier (kept legacy identifier)
- When checking if a post is video the new identifier is checked for, followed by the legacy identifier (if nothing was found)
