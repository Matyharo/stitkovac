'use client';

import React from 'react';

export interface ProductData {
  name: string;
  sku: string;
  brand?: string | null;
  price?: number | null;
  safetyText?: string | null;
  contactText?: string | null;
  ean?: string | null;
}

interface LabelPreviewProps {
  fields: {
    showName?: boolean;
    showSku?: boolean;
    showBrand?: boolean;
    showPrice?: boolean;
    showSafetyText?: boolean;
    showContactText?: boolean;
    showEan?: boolean;
    showNote?: boolean;
    showSafetyIcon?: boolean;
    showContactIcon?: boolean;
  };
  fonts: {
    fontFamily?: string;
    nameFontSize: number;
    skuFontSize: number;
    brandFontSize: number;
    priceFontSize: number;
    bodyFontSize: number;
    nameFontBold?: boolean;
    priceFontBold?: boolean;
    textAlignment?: string;
    brandColor?: string;
    nameColor?: string;
    priceColor?: string;
    bodyColor?: string;
  };
  layout: {
    labelWidth: number;
    labelHeight: number;
    labelRotation?: number;
    dualLayout?: boolean;
    customIcons?: Array<{
      id: string;
      name: string;
      position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center' | 'center' | 'middle-left' | 'middle-right';
      imageData: string;
      iconWidth: number;
      iconHeight: number;
      fillAllCells?: boolean;
    }>;
    sixIconsLayout?: boolean;
  };
  product?: ProductData;
}

const defaultProduct: ProductData = {
  name: 'Čisticí utěrky z mikrovlákna Premium',
  sku: 'SPK-UT-001',
  brand: 'Spoko Clean',
  price: 189,
  safetyText: 'Zevní použití. Po každém použití dobře uzavřete. Skladujte v chladu a vyhněte se slunečnímu záření. Zabraňte kontaktu s očima. Nepoužívejte na klientky s alergií na některou složku přípravku. Uchovávejte mimo dosah dětí a zvířat.',
  contactText: 'Spoko ČR s.r.o.\nIČO: 07996811\nPraha',
  ean: '8594001230012',
};

export function LabelPreview({ fields, fonts, layout, product: customProduct }: LabelPreviewProps) {
  const isRotated = layout.labelRotation === 90;
  const isDual = !!layout.dualLayout;
  const product = customProduct || defaultProduct;

  const mm = 2.83464567;
  const labelW = layout.labelWidth * mm;
  const labelH = layout.labelHeight * mm;

  // The visual width of the renderContent container in PDF points:
  const visualW = isRotated ? labelH : (isDual ? labelW / 2 : labelW);
  const toCqw = (pt: number) => `${(pt / visualW) * 100}cqw`;

  const visualCardW = (isRotated ? layout.labelHeight : layout.labelWidth) * mm;
  const toOuterCqw = (pt: number) => `${(pt / visualCardW) * 100}cqw`;

  const renderContent = (contentWidth: string) => {
    const alignment = fonts.textAlignment || 'left';
    const alignClass = alignment === 'center' ? 'text-center' : alignment === 'right' ? 'text-right' : 'text-left';
    const justifyClass = alignment === 'center' ? 'justify-center' : alignment === 'right' ? 'justify-end' : 'justify-start';
    const justifySkuClass = alignment === 'right' ? 'justify-end' : 'justify-center';

    return (
      <div 
        style={{
          width: contentWidth,
          fontFamily: fonts.fontFamily === 'Roboto' ? 'Roboto, sans-serif' : 'sans-serif',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: '100%',
          padding: toCqw(4),
          containerType: 'inline-size',
        }}
        className={`overflow-hidden text-slate-850 leading-tight ${alignClass}`}
      >
        {/* Brand */}
        {fields.showBrand && product.brand && (
          <div 
            style={{
              fontSize: toCqw(fonts.brandFontSize),
              color: fonts.brandColor || '#64748b',
              fontWeight: 'bold',
            }}
            className="uppercase tracking-wider truncate"
          >
            {product.brand}
          </div>
        )}

        {/* Name */}
        {fields.showName && product.name && (
          <div 
            style={{
              fontSize: toCqw(fonts.nameFontSize),
              color: fonts.nameColor || '#0f172a',
              fontWeight: fonts.nameFontBold ? 'bold' : 'normal',
              lineClamp: 2,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              marginTop: toCqw(0.5),
            }}
            className="overflow-hidden leading-tight"
          >
            {product.name}
          </div>
        )}

        {/* SKU/EAN */}
        {(fields.showSku || fields.showEan) && (
          <div 
            style={{
              fontSize: toCqw(fonts.skuFontSize),
              color: fonts.bodyColor || '#334155',
              gap: toCqw(1),
              marginTop: toCqw(1.5),
            }}
            className={`flex items-center min-w-0 ${alignment === 'left' ? 'justify-start' : justifySkuClass}`}
          >

            <span className="truncate">
              {fields.showSku ? `SKU: ${product.sku}` : ''}
              {fields.showSku && fields.showEan ? ' | ' : ''}
              {fields.showEan ? `EAN: ${product.ean}` : ''}
            </span>
          </div>
        )}

        {/* Safety */}
        {fields.showSafetyText && product.safetyText && (
          <div 
            style={{
              fontSize: toCqw(fonts.bodyFontSize),
              color: fonts.bodyColor || '#334155',
              marginTop: toCqw(2),
            }}
            className={`flex items-start gap-1 leading-normal ${justifyClass} ${alignClass}`}
          >
            {fields.showSafetyIcon && !isRotated && (
              <span 
                style={{
                  width: toCqw(8.4),
                  height: toCqw(7),
                  fontSize: toCqw(6),
                  borderRadius: toCqw(1),
                  marginTop: toCqw(0.5),
                }}
                className="inline-flex shrink-0 bg-amber-500 text-white leading-none items-center justify-center font-extrabold"
              >
                !
              </span>
            )}
            <span>{product.safetyText}</span>
          </div>
        )}

        {/* Price */}
        {fields.showPrice && product.price !== null && product.price !== undefined && (
          <div 
            style={{
              fontSize: toCqw(fonts.priceFontSize),
              color: fonts.priceColor || '#dc2626',
              fontWeight: fonts.priceFontBold ? 'bold' : 'normal',
              marginTop: toCqw(1.5),
              alignSelf: alignment === 'left' ? 'flex-end' : (alignment === 'right' ? 'flex-end' : 'center'),
            }}
            className="shrink-0 whitespace-nowrap"
          >
            {product.price} Kč
          </div>
        )}

        {/* Contact */}
        {fields.showContactText && product.contactText && (
          <div 
            style={{
              fontSize: toCqw(fonts.bodyFontSize),
              color: fonts.bodyColor || '#334155',
              marginTop: toCqw(2),
              paddingTop: toCqw(1.5),
              borderTopWidth: toCqw(0.5),
            }}
            className={`flex items-start gap-1 leading-normal whitespace-pre-line border-t border-slate-100 ${justifyClass} ${alignClass}`}
          >
            {fields.showContactIcon && !isRotated && (
              <span 
                style={{
                  fontSize: toCqw(8),
                  marginTop: toCqw(0.5),
                }}
                className="inline-block shrink-0 text-slate-400 leading-none"
              >
                ✉
              </span>
            )}
            <span>{product.contactText}</span>
          </div>
        )}
      </div>
    );
  };

  const w = isRotated ? layout.labelHeight : layout.labelWidth;
  const h = isRotated ? layout.labelWidth : layout.labelHeight;

  const renderedIcons = (layout.customIcons || []).map((icon: any) => {
    const iconWidthPt = icon.iconWidth * mm;
    const iconHeightPt = icon.iconHeight * mm;

    const style: React.CSSProperties = {
      position: 'absolute',
      width: toOuterCqw(iconWidthPt),
      height: toOuterCqw(iconHeightPt),
      pointerEvents: 'none',
      zIndex: 10,
    };
    switch (icon.position) {
      case 'top-left':
        style.top = toOuterCqw(4);
        style.left = toOuterCqw(4);
        break;
      case 'top-right':
        style.top = toOuterCqw(4);
        style.right = toOuterCqw(4);
        break;
      case 'top-center':
        style.top = toOuterCqw(4);
        style.left = '50%';
        style.transform = 'translateX(-50%)';
        break;
      case 'bottom-left':
        style.bottom = toOuterCqw(4);
        style.left = toOuterCqw(4);
        break;
      case 'bottom-center':
        style.bottom = toOuterCqw(4);
        style.left = '50%';
        style.transform = 'translateX(-50%)';
        break;
      case 'middle-left':
        style.top = '50%';
        style.left = toOuterCqw(4);
        style.transform = 'translateY(-50%)';
        break;
      case 'middle-right':
        style.top = '50%';
        style.right = toOuterCqw(4);
        style.transform = 'translateY(-50%)';
        break;
      case 'center':
        style.top = '50%';
        style.left = '50%';
        style.transform = 'translate(-50%, -50%)';
        break;
      case 'bottom-right':
      default:
        style.bottom = toOuterCqw(4);
        style.right = toOuterCqw(4);
        break;
    }
    return (
      <div key={icon.id} style={style} className="opacity-85">
        <img src={icon.imageData} alt="" className="w-full h-full object-contain" />
      </div>
    );
  });

  if (layout.sixIconsLayout) {
    const icons = layout.customIcons || [];
    const getIconForCell = (pos: string) => {
      const fillIcon = icons.find((i) => i.fillAllCells);
      const icon = fillIcon || icons.find((i) => i.position === pos);
      if (!icon) return null;
      return (
        <img 
          src={icon.imageData} 
          alt="" 
          style={{
            width: toOuterCqw(icon.iconWidth * mm),
            height: toOuterCqw(icon.iconHeight * mm),
          }}
          className="object-contain max-w-full max-h-full"
        />
      );
    };

    return (
      <div 
        style={{
          aspectRatio: `${w} / ${h}`,
          width: '100%',
          maxWidth: '280px',
          containerType: 'inline-size',
        }}
        className="mx-auto bg-white border border-slate-350 shadow-md rounded-lg relative overflow-hidden grid grid-cols-3 grid-rows-2 divide-x divide-y divide-slate-200 animate-in fade-in duration-300"
      >
        <div className="flex items-center justify-center p-1 overflow-hidden">{getIconForCell('top-left')}</div>
        <div className="flex items-center justify-center p-1 overflow-hidden">{getIconForCell('top-center')}</div>
        <div className="flex items-center justify-center p-1 overflow-hidden">{getIconForCell('top-right')}</div>
        <div className="flex items-center justify-center p-1 overflow-hidden">{getIconForCell('bottom-left')}</div>
        <div className="flex items-center justify-center p-1 overflow-hidden">{getIconForCell('bottom-center')}</div>
        <div className="flex items-center justify-center p-1 overflow-hidden">{getIconForCell('bottom-right')}</div>
      </div>
    );
  }

  return (
    <div 
      style={{
        aspectRatio: `${w} / ${h}`,
        width: '100%',
        maxWidth: '280px',
        containerType: 'inline-size',
      }}
      className="mx-auto bg-white border border-slate-350 shadow-md rounded-lg relative overflow-hidden flex flex-col justify-between animate-in fade-in duration-300"
    >
      {isDual ? (
        isRotated ? (
          <div className="flex flex-col h-full w-full divide-y divide-slate-200">
            <div className="h-1/2 w-full flex items-center justify-center overflow-hidden">
              {renderContent('100%')}
            </div>
            <div className="h-1/2 w-full flex items-center justify-center overflow-hidden">
              {renderContent('100%')}
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full divide-x divide-slate-200">
            <div className="w-1/2 h-full flex items-center justify-center overflow-hidden">
              {renderContent('100%')}
            </div>
            <div className="w-1/2 h-full flex items-center justify-center overflow-hidden">
              {renderContent('100%')}
            </div>
          </div>
        )
      ) : (
        renderContent('100%')
      )}
      {renderedIcons}
    </div>
  );
}
