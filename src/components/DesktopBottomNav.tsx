/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Cat, Clover, Film, Home, Search, Star, Tv } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface DesktopBottomNavProps {
  /** 主动指定当前激活的路径；未提供时使用浏览器路径 */
  activePath?: string;
}

const DesktopBottomNav = ({ activePath }: DesktopBottomNavProps) => {
  const pathname = usePathname();
  const currentActive = activePath ?? pathname;

  const [navItems, setNavItems] = useState([
    { icon: Home, label: '首页', href: '/' },
    { icon: Search, label: '搜索', href: '/search' },
    { icon: Film, label: '电影', href: '/douban?type=movie' },
    { icon: Tv, label: '剧集', href: '/douban?type=tv' },
    { icon: Cat, label: '动漫', href: '/douban?type=anime' },
    { icon: Clover, label: '综艺', href: '/douban?type=show' },
  ]);

  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;
    if (runtimeConfig?.CUSTOM_CATEGORIES?.length > 0) {
      setNavItems((prev) => [
        ...prev,
        { icon: Star, label: '自定义', href: '/douban?type=custom' },
      ]);
    }
  }, []);

  const isActive = (href: string) => {
    const typeMatch = href.match(/type=([^&]+)/)?.[1];
    const decodedActive = decodeURIComponent(currentActive);
    const decodedItemHref = decodeURIComponent(href);
    return (
      decodedActive === decodedItemHref ||
      (decodedActive.startsWith('/douban') &&
        (typeMatch ? decodedActive.includes(`type=${typeMatch}`) : false))
    );
  };

  return (
    <nav
      className='hidden md:block fixed z-[600]'
      style={{ left: '50%', transform: 'translateX(-50%)', bottom: '1rem' }}
    >
      <div
        data-liquid
        className='border rounded-3xl px-6 py-3 shadow-xl'
      >
        <ul className='flex items-center gap-5 px-1'>
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href} className='flex-shrink-0'>
                <Link
                  href={item.href}
                  className='flex flex-col items-center justify-center w-22 h-18 gap-1 text-xs'
                >
                  <item.icon
                    className={`h-6 w-6 ${
                      active
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  />
                  <span
                    className={
                      active
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-600 dark:text-gray-300'
                    }
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
};

export default DesktopBottomNav;