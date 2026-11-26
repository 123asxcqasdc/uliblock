import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Modal from '../../containers/modal.jsx';
import {formatBytes} from '../../lib/uli-sb3-explorer';
import styles from './sb3-explorer-modal.css';

const getNodeIcon = node => {
    if (!node) return '📄';
    if (node.type === 'dir') {
        if (node.isTargetDir) return node.isStage ? '🎭' : '🐌';
        return '📁';
    }
    if (node.kind === 'costume') return '🖼️';
    if (node.kind === 'sound') return '🔊';
    if (node.kind === 'sprite3') return '📦';
    if (node.kind === 'extension-js' || node.kind === 'extension-builtin') return '🧩';
    if (node.kind === 'font') return '🔤';
    if (node.kind === 'json') return '📋';
    return '📄';
};

const renderTreeNodes = (nodesByPath, dirPath, depth, currentPath, onNavigate) => {
    const dir = nodesByPath[dirPath];
    if (!dir || dir.type !== 'dir') return null;

    const childDirs = (dir.children || []).filter(c => c.type === 'dir');
    return (
        <React.Fragment key={dirPath}>
            <button
                type="button"
                className={classNames(styles.treeRow, {
                    [styles.treeRowActive]: currentPath === dir.path
                })}
                style={{paddingLeft: `${8 + (depth * 14)}px`}}
                title={dir.path}
                onClick={() => onNavigate(dir.path)}
            >
                <span>{getNodeIcon(dir)}</span>
                <span>{dir.path === '/' ? `/ (${dir.name})` : dir.name}</span>
            </button>
            {childDirs.map(child => renderTreeNodes(nodesByPath, child.path, depth + 1, currentPath, onNavigate))}
        </React.Fragment>
    );
};

const Sb3ExplorerModalComponent = props => {
    const {
        snapshot,
        currentPath,
        selectedItemPath,
        checkedPaths,
        searchQuery,
        exportMode,
        spriteExportAsZip,
        selectedSpriteIds,
        previewUrl,
        previewText,
        busy,
        statusMessage,
        errorMessage,
        onClose,
        onRefresh,
        onNavigate,
        onSelectItem,
        onToggleCheck,
        onCheckAllInFolder,
        onClearChecks,
        onSearchChange,
        onExportModeChange,
        onToggleSpriteExportAsZip,
        onToggleSpriteId,
        onDownloadSelectedNode,
        onRunExport
    } = props;

    const currentDir = snapshot.nodesByPath[currentPath] || snapshot.nodesByPath['/'];
    const selectedNode = selectedItemPath ? snapshot.nodesByPath[selectedItemPath] : null;
    const rawChildren = currentDir && currentDir.children ? currentDir.children : [];
    const query = (searchQuery || '').trim().toLowerCase();

    const visibleItems = query ?
        Object.values(snapshot.nodesByPath).filter(n => n.path !== '/' && (
            n.name.toLowerCase().includes(query) ||
            n.path.toLowerCase().includes(query)
        )) :
        rawChildren;

    // Sort folders first, then files alphabetically
    const sortedItems = visibleItems.slice().sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    const pathSegments = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean);
    const nonStageSprites = snapshot.spriteEntries.filter(s => !s.isStage);

    return (
        <Modal
            className={styles.modalContent}
            contentLabel="SB3 Explorer — проводник проекта"
            id="uliSb3ExplorerModal"
            onRequestClose={onClose}
        >
            <div className={styles.body}>
                <div className={styles.toolbar}>
                    <div className={styles.breadcrumbs}>
                        <button
                            type="button"
                            className={styles.crumbBtn}
                            onClick={() => onNavigate('/')}
                        >
                            /
                        </button>
                        {pathSegments.map((seg, idx) => {
                            const segPath = `/${pathSegments.slice(0, idx + 1).join('/')}`;
                            return (
                                <React.Fragment key={segPath}>
                                    <span className={styles.crumbSep}>/</span>
                                    <button
                                        type="button"
                                        className={styles.crumbBtn}
                                        onClick={() => onNavigate(segPath)}
                                    >
                                        {seg}
                                    </button>
                                </React.Fragment>
                            );
                        })}
                    </div>

                    <input
                        className={styles.searchInput}
                        type="search"
                        placeholder="Поиск по файлам и путям..."
                        value={searchQuery}
                        onChange={e => onSearchChange(e.target.value)}
                    />

                    <button
                        type="button"
                        className={styles.btn}
                        disabled={busy}
                        onClick={onRefresh}
                    >
                        ↻ Обновить
                    </button>
                </div>

                <div className={styles.statsBar}>
                    <div className={styles.statsPills}>
                        <span className={styles.statPill}>Спрайтов: {snapshot.stats.spriteCount}</span>
                        <span className={styles.statPill}>Костюмов и фонов: {snapshot.stats.costumeCount}</span>
                        <span className={styles.statPill}>Звуков: {snapshot.stats.soundCount}</span>
                        <span className={styles.statPill}>Расширений: {snapshot.stats.extensionCount}</span>
                        <span className={styles.statPill}>Размер данных: {formatBytes(snapshot.stats.totalBytes)}</span>
                    </div>
                    {statusMessage && <span className={styles.statusText}>{statusMessage}</span>}
                    {errorMessage && <span className={styles.errorText}>{errorMessage}</span>}
                </div>

                <div className={styles.explorerGrid}>
                    {/* Left: Folder Tree */}
                    <div className={styles.pane}>
                        <div className={styles.paneHeader}>
                            <span>Структура .sb3</span>
                        </div>
                        <div className={styles.paneScroll}>
                            {renderTreeNodes(snapshot.nodesByPath, '/', 0, currentPath, onNavigate)}
                        </div>
                    </div>

                    {/* Center: Explorer File List */}
                    <div className={styles.pane}>
                        <div className={styles.paneHeader}>
                            <span>
                                {query ? `Результаты поиска (${sortedItems.length})` : `Папка: ${currentPath}`}
                            </span>
                            <div style={{display: 'flex', gap: '6px'}}>
                                <button
                                    type="button"
                                    className={classNames(styles.btn, styles.btnSmall)}
                                    onClick={() => onCheckAllInFolder(sortedItems)}
                                >
                                    Выбрать все
                                </button>
                                {checkedPaths.length > 0 && (
                                    <button
                                        type="button"
                                        className={classNames(styles.btn, styles.btnSmall)}
                                        onClick={onClearChecks}
                                    >
                                        Сброс ({checkedPaths.length})
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className={styles.paneScroll}>
                            {!query && currentDir && currentDir.parentPath !== null && (
                                <div
                                    className={styles.fileRow}
                                    onClick={() => onNavigate(currentDir.parentPath)}
                                >
                                    <span className={styles.fileIcon}>⬆️</span>
                                    <span className={styles.fileName}>.. (на уровень выше)</span>
                                </div>
                            )}

                            {sortedItems.length === 0 && (
                                <div className={styles.emptyHint}>Папка пуста</div>
                            )}

                            {sortedItems.map(item => {
                                const isChecked = checkedPaths.indexOf(item.path) !== -1;
                                const isSelected = selectedItemPath === item.path;
                                const countMeta = item.type === 'dir' ?
                                    `${(item.children || []).length} элем.` :
                                    (item.kind === 'sprite3' ? '.sprite3' : formatBytes(item.size));

                                return (
                                    <div
                                        key={item.path}
                                        className={classNames(styles.fileRow, {
                                            [styles.fileRowActive]: isSelected
                                        })}
                                        onClick={() => onSelectItem(item)}
                                        onDoubleClick={() => {
                                            if (item.type === 'dir') {
                                                onNavigate(item.path);
                                            }
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            className={styles.fileCheckbox}
                                            checked={isChecked}
                                            onChange={() => onToggleCheck(item.path)}
                                            onClick={e => e.stopPropagation()}
                                        />
                                        <span className={styles.fileIcon}>{getNodeIcon(item)}</span>
                                        <span className={styles.fileName} title={item.path}>
                                            {query ? item.path : item.name}
                                        </span>
                                        <span className={styles.fileMeta}>{countMeta}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right: Preview & Inspector */}
                    <div className={styles.pane}>
                        <div className={styles.paneHeader}>
                            <span>Просмотр</span>
                            {selectedNode && selectedNode.type === 'file' && (
                                <button
                                    type="button"
                                    className={classNames(styles.btn, styles.btnPrimary, styles.btnSmall)}
                                    disabled={busy}
                                    onClick={() => onDownloadSelectedNode(selectedNode)}
                                >
                                    ⬇ Скачать
                                </button>
                            )}
                        </div>

                        <div className={styles.previewBox}>
                            {!selectedNode && (
                                <div className={styles.emptyHint}>
                                    Выберите файл или папку для просмотра.
                                    Двойной клик по папке открывает её.
                                </div>
                            )}

                            {selectedNode && (
                                <React.Fragment>
                                    <div>
                                        <div className={styles.previewTitle}>
                                            {getNodeIcon(selectedNode)} {selectedNode.name}
                                        </div>
                                        <div className={styles.previewPath}>{selectedNode.path}</div>
                                    </div>

                                    {selectedNode.kind === 'costume' && previewUrl && (
                                        <div className={styles.imageStage}>
                                            <img
                                                src={previewUrl}
                                                alt={selectedNode.name}
                                            />
                                        </div>
                                    )}

                                    {selectedNode.kind === 'sound' && previewUrl && (
                                        <audio
                                            controls
                                            src={previewUrl}
                                            style={{width: '100%'}}
                                        />
                                    )}

                                    {previewText !== null && previewText !== undefined && (
                                        <pre className={styles.codePreview}>{previewText}</pre>
                                    )}

                                    <div className={styles.metaTable}>
                                        <div className={styles.metaRow}>
                                            <span className={styles.metaKey}>Тип:</span>
                                            <span>{selectedNode.type === 'dir' ? 'Папка' : (selectedNode.ext || selectedNode.kind)}</span>
                                        </div>
                                        {selectedNode.type === 'file' && (
                                            <div className={styles.metaRow}>
                                                <span className={styles.metaKey}>Размер:</span>
                                                <span>
                                                    {selectedNode.kind === 'sprite3' ?
                                                        'Формируется при экспорте' :
                                                        formatBytes(selectedNode.size)}
                                                </span>
                                            </div>
                                        )}
                                        {selectedNode.spriteName && (
                                            <div className={styles.metaRow}>
                                                <span className={styles.metaKey}>Спрайт:</span>
                                                <span>{selectedNode.spriteName}</span>
                                            </div>
                                        )}
                                        {selectedNode.md5 && (
                                            <div className={styles.metaRow}>
                                                <span className={styles.metaKey}>MD5:</span>
                                                <span style={{fontFamily: 'monospace'}}>{selectedNode.md5}</span>
                                            </div>
                                        )}
                                        {selectedNode.extensionUrl && (
                                            <div className={styles.metaRow}>
                                                <span className={styles.metaKey}>URL:</span>
                                                <span style={{wordBreak: 'break-all', textAlign: 'right'}}>
                                                    {selectedNode.extensionUrl}
                                                </span>
                                            </div>
                                        )}
                                        {selectedNode.description && (
                                            <div style={{opacity: 0.85, marginTop: '4px'}}>
                                                {selectedNode.description}
                                            </div>
                                        )}
                                    </div>
                                </React.Fragment>
                            )}
                        </div>
                    </div>
                </div>

                {/* Bottom: Selective Export Panel */}
                <div className={styles.exportPanel}>
                    <div className={styles.exportModes}>
                        <button
                            type="button"
                            className={classNames(styles.modeChip, {
                                [styles.modeChipActive]: exportMode === 'checked'
                            })}
                            onClick={() => onExportModeChange('checked')}
                        >
                            ☑ Выбранное ({checkedPaths.length})
                        </button>
                        <button
                            type="button"
                            className={classNames(styles.modeChip, {
                                [styles.modeChipActive]: exportMode === 'costumes'
                            })}
                            onClick={() => onExportModeChange('costumes')}
                        >
                            🖼️ Только костюмы и фоны ({snapshot.stats.costumeCount})
                        </button>
                        <button
                            type="button"
                            className={classNames(styles.modeChip, {
                                [styles.modeChipActive]: exportMode === 'sounds'
                            })}
                            onClick={() => onExportModeChange('sounds')}
                        >
                            🔊 Только звуки ({snapshot.stats.soundCount})
                        </button>
                        <button
                            type="button"
                            className={classNames(styles.modeChip, {
                                [styles.modeChipActive]: exportMode === 'sprites'
                            })}
                            onClick={() => onExportModeChange('sprites')}
                        >
                            📦 Спрайты как .sprite3 ({nonStageSprites.length})
                        </button>
                        <button
                            type="button"
                            className={classNames(styles.modeChip, {
                                [styles.modeChipActive]: exportMode === 'extensions'
                            })}
                            onClick={() => onExportModeChange('extensions')}
                        >
                            🧩 Только расширения ({snapshot.stats.extensionCount})
                        </button>
                        <button
                            type="button"
                            className={classNames(styles.modeChip, {
                                [styles.modeChipActive]: exportMode === 'all'
                            })}
                            onClick={() => onExportModeChange('all')}
                        >
                            🗂️ Всё дерево (.zip)
                        </button>
                    </div>

                    {exportMode === 'sprites' && nonStageSprites.length > 0 && (
                        <div className={styles.spriteChecklist}>
                            {nonStageSprites.map(sprite => {
                                const active = selectedSpriteIds.indexOf(sprite.id) !== -1;
                                return (
                                    <label key={sprite.id} className={styles.spritePill}>
                                        <input
                                            type="checkbox"
                                            className={styles.fileCheckbox}
                                            checked={active}
                                            onChange={() => onToggleSpriteId(sprite.id)}
                                        />
                                        <span>{sprite.name}.sprite3</span>
                                    </label>
                                );
                            })}
                        </div>
                    )}

                    <div className={styles.exportSuboptions}>
                        <div>
                            {exportMode === 'checked' && (
                                <span>
                                    Отметьте чекбоксы рядом с нужными папками или файлами в списке проводника.
                                </span>
                            )}
                            {exportMode === 'costumes' && (
                                <span>
                                    Экспортирует все костюмы спрайтов и фоны сцены в ZIP с путями вида <code>/sprite/res/costumes/name.ext</code>.
                                </span>
                            )}
                            {exportMode === 'sounds' && (
                                <span>
                                    Экспортирует все звуки проекта в ZIP с путями вида <code>/sprite/res/sounds/name.wav</code>.
                                </span>
                            )}
                            {exportMode === 'sprites' && (
                                <label style={{display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer'}}>
                                    <input
                                        type="checkbox"
                                        className={styles.fileCheckbox}
                                        checked={spriteExportAsZip}
                                        onChange={onToggleSpriteExportAsZip}
                                    />
                                    <span>Упаковать выбранные <code>.sprite3</code> в один ZIP (иначе каждый скачается отдельным файлом)</span>
                                </label>
                            )}
                            {exportMode === 'extensions' && (
                                <span>
                                    Экспортирует <code>extensions.json</code> и исходные <code>.js</code>-файлы пользовательских расширений.
                                </span>
                            )}
                            {exportMode === 'all' && (
                                <span>
                                    Сохраняет всю структуру проводника (<code>project.json</code>, ресурсы, <code>.sprite3</code>, расширения и шрифты) в один ZIP-архив.
                                </span>
                            )}
                        </div>

                        <div style={{display: 'flex', gap: '8px'}}>
                            <button
                                type="button"
                                className={styles.btn}
                                onClick={onClose}
                            >
                                Закрыть
                            </button>
                            <button
                                type="button"
                                className={classNames(styles.btn, styles.btnPrimary)}
                                disabled={busy || (exportMode === 'checked' && checkedPaths.length === 0)}
                                onClick={onRunExport}
                            >
                                {busy ? 'Экспорт...' : '⬇ Экспортировать'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

Sb3ExplorerModalComponent.propTypes = {
    snapshot: PropTypes.object.isRequired,
    currentPath: PropTypes.string.isRequired,
    selectedItemPath: PropTypes.string,
    checkedPaths: PropTypes.arrayOf(PropTypes.string).isRequired,
    searchQuery: PropTypes.string.isRequired,
    exportMode: PropTypes.string.isRequired,
    spriteExportAsZip: PropTypes.bool.isRequired,
    selectedSpriteIds: PropTypes.arrayOf(PropTypes.string).isRequired,
    previewUrl: PropTypes.string,
    previewText: PropTypes.string,
    busy: PropTypes.bool.isRequired,
    statusMessage: PropTypes.string,
    errorMessage: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    onRefresh: PropTypes.func.isRequired,
    onNavigate: PropTypes.func.isRequired,
    onSelectItem: PropTypes.func.isRequired,
    onToggleCheck: PropTypes.func.isRequired,
    onCheckAllInFolder: PropTypes.func.isRequired,
    onClearChecks: PropTypes.func.isRequired,
    onSearchChange: PropTypes.func.isRequired,
    onExportModeChange: PropTypes.func.isRequired,
    onToggleSpriteExportAsZip: PropTypes.func.isRequired,
    onToggleSpriteId: PropTypes.func.isRequired,
    onDownloadSelectedNode: PropTypes.func.isRequired,
    onRunExport: PropTypes.func.isRequired
};

export default Sb3ExplorerModalComponent;
