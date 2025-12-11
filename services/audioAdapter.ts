/**
 * Audio Adapter - Platform-agnostic audio URL resolution
 * 
 * This module provides a unified interface for resolving direct audio download URLs
 * across different music platforms (QQ Music, Netease Cloud Music, etc.).
 * 
 * Key principles:
 * - Always return direct audio file URLs, never platform web pages
 * - Return null when direct download is not available
 * - Use platform + ID as the canonical key (never rely on song title)
 * - Handle platform-specific authentication and URL signing
 */

import { Song } from '../types';
import { getDirectAudioUrl as getQQMusicDirectUrl } from './qqmusic';
import { getDirectAudioUrl as getNeteaseDirectUrl } from './lyricsService';

/**
 * Get direct audio download URL for a song
 * 
 * This function routes to the appropriate platform adapter based on the song's
 * metadata and attempts to resolve a direct, downloadable audio URL.
 * 
 * Platform support:
 * - QQ Music: Resolves via 317ak API to get time-limited CDN URLs
 * - Netease Cloud Music: Uses Meting API which redirects to Netease CDN
 * - Local files: Returns the file URL if not a blob URL
 * 
 * Return values:
 * - string: Direct audio URL that can be opened in a new tab for download
 * - null: Direct download not available for this track
 * 
 * When null is returned, UI should:
 * - Disable the download button
 * - Show a tooltip: "Direct download is not available for this track"
 * 
 * Security considerations:
 * - All URLs are time-limited and signed by their respective platforms
 * - URLs are safe to expose client-side (no long-lived tokens)
 * - Opens in new tab with rel="noopener noreferrer" to prevent security issues
 * 
 * @param song - Song object with platform metadata
 * @returns Promise<string | null> - Direct audio URL or null if unavailable
 */
export async function getDirectAudioUrl(song: Song): Promise<string | null> {
  // QQ Music tracks
  if (song.isQQMusic && song.qqMusicMid) {
    return await getQQMusicDirectUrl(song.qqMusicMid);
  }
  
  // Netease Cloud Music tracks
  if (song.isNetease && song.neteaseId) {
    return await getNeteaseDirectUrl(song.neteaseId);
  }
  
  // Local files: return URL if not a blob URL
  // Blob URLs are temporary and not suitable for download links
  if (song.fileUrl && !song.fileUrl.startsWith('blob:')) {
    return song.fileUrl;
  }
  
  // No supported platform or direct URL available
  console.warn('[AudioAdapter] getDirectAudioUrl: No supported platform for song:', song.title);
  return null;
}

/**
 * Check if a song supports direct download
 * 
 * This is a lightweight check that doesn't make API calls.
 * It only checks if the song has the required platform metadata.
 * 
 * Note: This doesn't guarantee the download will succeed (the API
 * might still fail), but it's useful for initial UI state.
 * 
 * @param song - Song object to check
 * @returns boolean - true if the song might support direct download
 */
export function canAttemptDirectDownload(song: Song): boolean {
  // QQ Music: needs songmid
  if (song.isQQMusic && song.qqMusicMid) {
    return true;
  }
  
  // Netease: needs neteaseId
  if (song.isNetease && song.neteaseId) {
    return true;
  }
  
  // Local files: needs non-blob URL
  if (song.fileUrl && !song.fileUrl.startsWith('blob:')) {
    return true;
  }
  
  return false;
}
