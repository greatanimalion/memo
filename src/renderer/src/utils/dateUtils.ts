/**
 * 日期工具函数
 */

/**
 * 格式化时间为 HH:MM:SS
 */
export const formatTime = (timeStemp: string | Date | number): string => {
  if (typeof timeStemp === 'string') timeStemp = Number(timeStemp)
  const date = new Date(timeStemp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * 格式化日期为中文格式（如：2024年3月13日 星期三）
 */
export const formatDate = (timeStemp: string | Date | number): string => {
  if (typeof timeStemp === 'string') timeStemp = Number(timeStemp)
  const date = new Date(timeStemp)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  })
}

/**
 * 格式化相对时间（如：2小时前、昨天）
 */
export const formatRelativeTime = (timeStemp: string | Date | number): string => {
  if (typeof timeStemp === 'string') timeStemp = Number(timeStemp)
  const date = new Date(timeStemp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 1) {
    return '刚刚'
  } else if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`
  } else if (diffHours < 24) {
    return `${diffHours}小时前`
  } else if (diffDays === 1) {
    return '昨天'
  } else if (diffDays < 7) {
    return `${diffDays}天前`
  } else {
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }
}

/**
 * 格式化短时间（如：10:30）
 */
export const formatShortTime = (date: Date | number | string): string => {
  if (typeof date === 'string') date = Number(date)
  const dateObj = new Date(date)
  return dateObj.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/**
 * 格式化时间，将时间戳换成日期（如：2022-03-13）
 */
export const formatDateByTimestamp = (timestamp: number|String): string => {
  const date = new Date(+timestamp)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`
}

/**
 * 获取当前时间：如2022-03-13-10-30-00
*/
export const getCurrentTime = (): string => {
  const date = new Date()
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()
  return `${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}-${hour < 10 ? '0' + hour : hour}-${minute < 10 ? '0' + minute : minute}-${second < 10 ? '0' + second : second}`
}