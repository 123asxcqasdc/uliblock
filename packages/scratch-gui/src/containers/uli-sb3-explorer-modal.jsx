import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import VM from 'scratch-vm';
import {closeSb3ExplorerModal} from '../reducers/modals';
import {
    sanitizeName,
    fetchExtensionBytes,
    buildSb3ExplorerSnapshot,
    collectFilesUnderPath,
    exportSingleNode,
    exportNodesAsZip,
    exportSpritesAsSprite3
} from '../lib/uli-sb3-explorer';
import Sb3ExplorerModalComponent from '../components/uli-sb3-explorer/sb3-explorer-modal.jsx';

const textDecoder = new TextDecoder('utf-8', {fatal: false});

class UliSb3ExplorerModal extends React.Component {
    constructor (props) {
        super(props);
        const snapshot = buildSb3ExplorerSnapshot(props.vm, props.projectTitle);
        const defaultSpriteIds = snapshot.spriteEntries
            .filter(s => !s.isStage)
            .map(s => s.id);

        this.state = {
            snapshot,
            currentPath: '/',
            selectedItemPath: '/project.json',
            checkedPaths: [],
            collapsedPaths: [],
            searchQuery: '',
            exportMode: 'costumes',
            spriteExportAsZip: false,
            selectedSpriteIds: defaultSpriteIds,
            previewUrl: null,
            previewText: null,
            busy: false,
            statusMessage: '',
            errorMessage: ''
        };
    }

    componentDidMount () {
        this.loadPreviewForPath(this.state.selectedItemPath, this.state.snapshot);
    }

    componentWillUnmount () {
        this.revokePreviewUrl();
    }

    revokePreviewUrl () {
        if (this.state.previewUrl) {
            try {
                URL.revokeObjectURL(this.state.previewUrl);
            } catch (_e) {
                // ignore
            }
        }
    }

    async loadPreviewForPath (itemPath, snapshot = this.state.snapshot) {
        this.revokePreviewUrl();
        const node = itemPath ? snapshot.nodesByPath[itemPath] : null;
        if (!node || node.type !== 'file') {
            this.setState({previewUrl: null, previewText: null});
            return;
        }

        if (node.kind === 'costume' || node.kind === 'sound') {
            const bytes = node.bytes || new Uint8Array(0);
            const url = URL.createObjectURL(new Blob([bytes], {type: node.mime || 'application/octet-stream'}));
            let svgText = null;
            if (node.ext === 'svg' && bytes.length < 40000) {
                svgText = textDecoder.decode(bytes);
            }
            this.setState({previewUrl: url, previewText: svgText});
            return;
        }

        if (node.kind === 'json' || node.kind === 'extension-builtin') {
            const fullText = node.text || '';
            const previewText = fullText.length > 20000 ?
                `${fullText.slice(0, 20000)}\n\n... (обрезано для предпросмотра; при скачивании файл полный)` :
                fullText;
            this.setState({previewUrl: null, previewText});
            return;
        }

        if (node.kind === 'extension-js') {
            this.setState({previewUrl: null, previewText: 'Загрузка исходного кода расширения...'});
            const {bytes} = await fetchExtensionBytes(node);
            if (this.state.selectedItemPath !== node.path) return;
            const decoded = textDecoder.decode(bytes);
            const previewText = decoded.length > 20000 ?
                `${decoded.slice(0, 20000)}\n\n... (обрезано для предпросмотра)` :
                decoded;
            this.setState({previewUrl: null, previewText});
            return;
        }

        this.setState({previewUrl: null, previewText: null});
    }

    handleRefresh = () => {
        const snapshot = buildSb3ExplorerSnapshot(this.props.vm, this.props.projectTitle);
        const currentPath = snapshot.nodesByPath[this.state.currentPath] ? this.state.currentPath : '/';
        const selectedItemPath = snapshot.nodesByPath[this.state.selectedItemPath] ?
            this.state.selectedItemPath :
            '/project.json';
        const defaultSpriteIds = snapshot.spriteEntries
            .filter(s => !s.isStage)
            .map(s => s.id);
        this.setState({
            snapshot,
            currentPath,
            selectedItemPath,
            checkedPaths: [],
            selectedSpriteIds: defaultSpriteIds,
            statusMessage: 'Содержимое проекта обновлено',
            errorMessage: ''
        });
        this.loadPreviewForPath(selectedItemPath, snapshot);
    };

    handleNavigate = dirPath => {
        const {snapshot} = this.state;
        const target = snapshot.nodesByPath[dirPath];
        if (!target || target.type !== 'dir') return;

        // Ensure all ancestor folders of dirPath are expanded in the left tree
        const ancestors = [];
        let cursor = target.parentPath;
        while (cursor) {
            ancestors.push(cursor);
            const parentNode = snapshot.nodesByPath[cursor];
            cursor = parentNode ? parentNode.parentPath : null;
        }

        this.setState(prev => ({
            currentPath: dirPath,
            selectedItemPath: dirPath,
            collapsedPaths: prev.collapsedPaths.filter(p => ancestors.indexOf(p) === -1),
            searchQuery: '',
            statusMessage: '',
            errorMessage: ''
        }));
        this.loadPreviewForPath(dirPath, snapshot);
    };

    handleToggleCollapse = dirPath => {
        this.setState(prev => {
            const exists = prev.collapsedPaths.indexOf(dirPath) !== -1;
            const next = exists ?
                prev.collapsedPaths.filter(p => p !== dirPath) :
                [...prev.collapsedPaths, dirPath];
            return {collapsedPaths: next};
        });
    };

    handleExpandAll = () => {
        this.setState({collapsedPaths: []});
    };

    handleCollapseAll = () => {
        const {snapshot} = this.state;
        const allNestedDirs = Object.values(snapshot.nodesByPath)
            .filter(n => n.type === 'dir' && n.path !== '/')
            .map(n => n.path);
        this.setState({collapsedPaths: allNestedDirs});
    };

    handleSelectItem = item => {
        this.setState({
            selectedItemPath: item.path,
            statusMessage: '',
            errorMessage: ''
        });
        this.loadPreviewForPath(item.path);
    };

    handleToggleCheck = itemPath => {
        this.setState(prev => {
            const exists = prev.checkedPaths.indexOf(itemPath) !== -1;
            const next = exists ?
                prev.checkedPaths.filter(p => p !== itemPath) :
                [...prev.checkedPaths, itemPath];
            return {checkedPaths: next};
        });
    };

    handleCheckAllInFolder = items => {
        this.setState(prev => {
            const set = new Set(prev.checkedPaths);
            items.forEach(item => set.add(item.path));
            return {checkedPaths: Array.from(set)};
        });
    };

    handleClearChecks = () => {
        this.setState({checkedPaths: []});
    };

    handleToggleSpriteId = id => {
        this.setState(prev => {
            const exists = prev.selectedSpriteIds.indexOf(id) !== -1;
            const next = exists ?
                prev.selectedSpriteIds.filter(x => x !== id) :
                [...prev.selectedSpriteIds, id];
            return {selectedSpriteIds: next};
        });
    };

    handleDownloadSelectedNode = async node => {
        this.setState({busy: true, statusMessage: `Экспорт ${node.name}...`, errorMessage: ''});
        try {
            await exportSingleNode(this.props.vm, node);
            this.setState({busy: false, statusMessage: `Скачан файл ${node.name}`});
        } catch (err) {
            this.setState({busy: false, errorMessage: err.message || String(err)});
        }
    };

    handleRunExport = async () => {
        const {snapshot, checkedPaths, exportMode, spriteExportAsZip, selectedSpriteIds} = this.state;
        const projectBase = sanitizeName(this.props.projectTitle || 'uliblock-project', 'uliblock-project');

        this.setState({busy: true, statusMessage: 'Подготовка экспорта...', errorMessage: ''});
        try {
            if (exportMode === 'checked') {
                const uniqueMap = new Map();
                checkedPaths.forEach(p => {
                    collectFilesUnderPath(snapshot.nodesByPath, p).forEach(fileNode => {
                        uniqueMap.set(fileNode.path, fileNode);
                    });
                });
                const files = Array.from(uniqueMap.values());
                if (files.length === 0) {
                    throw new Error('Отметьте хотя бы один файл или непустую папку.');
                }
                if (files.length === 1) {
                    await exportSingleNode(this.props.vm, files[0]);
                    this.setState({busy: false, statusMessage: `Экспортирован файл ${files[0].name}`});
                    return;
                }
                await exportNodesAsZip(
                    this.props.vm,
                    files,
                    `${projectBase}-selected.zip`,
                    (done, total, name) => {
                        this.setState({statusMessage: `Упаковка ${done}/${total}: ${name}`});
                    }
                );
                this.setState({busy: false, statusMessage: `Сохранено ${files.length} файлов в ${projectBase}-selected.zip`});
                return;
            }

            if (exportMode === 'costumes') {
                if (snapshot.costumeNodes.length === 0) {
                    throw new Error('В проекте нет костюмов и фонов.');
                }
                await exportNodesAsZip(
                    this.props.vm,
                    snapshot.costumeNodes,
                    `${projectBase}-costumes.zip`,
                    (done, total, name) => {
                        this.setState({statusMessage: `Костюмы ${done}/${total}: ${name}`});
                    }
                );
                this.setState({
                    busy: false,
                    statusMessage: `Экспортировано костюмов и фонов: ${snapshot.costumeNodes.length}`
                });
                return;
            }

            if (exportMode === 'sounds') {
                if (snapshot.soundNodes.length === 0) {
                    throw new Error('В проекте нет звуков.');
                }
                await exportNodesAsZip(
                    this.props.vm,
                    snapshot.soundNodes,
                    `${projectBase}-sounds.zip`,
                    (done, total, name) => {
                        this.setState({statusMessage: `Звуки ${done}/${total}: ${name}`});
                    }
                );
                this.setState({
                    busy: false,
                    statusMessage: `Экспортировано звуков: ${snapshot.soundNodes.length}`
                });
                return;
            }

            if (exportMode === 'sprites') {
                const chosen = snapshot.spriteEntries.filter(
                    s => !s.isStage && selectedSpriteIds.indexOf(s.id) !== -1
                );
                if (chosen.length === 0) {
                    throw new Error('Выберите хотя бы один спрайт для экспорта в .sprite3.');
                }
                await exportSpritesAsSprite3(
                    this.props.vm,
                    chosen,
                    spriteExportAsZip,
                    `${projectBase}-sprites.zip`,
                    (done, total, name) => {
                        this.setState({statusMessage: `Экспорт .sprite3 (${done}/${total}): ${name}`});
                    }
                );
                this.setState({
                    busy: false,
                    statusMessage: spriteExportAsZip && chosen.length > 1 ?
                        `Сохранено ${chosen.length} спрайтов в ${projectBase}-sprites.zip` :
                        `Экспортировано спрайтов .sprite3: ${chosen.length}`
                });
                return;
            }

            if (exportMode === 'extensions') {
                const extFolderFiles = collectFilesUnderPath(snapshot.nodesByPath, '/extensions');
                if (extFolderFiles.length === 0) {
                    throw new Error('В проекте нет расширений.');
                }
                await exportNodesAsZip(
                    this.props.vm,
                    extFolderFiles,
                    `${projectBase}-extensions.zip`,
                    (done, total, name) => {
                        this.setState({statusMessage: `Расширения ${done}/${total}: ${name}`});
                    }
                );
                this.setState({
                    busy: false,
                    statusMessage: `Экспортированы расширения (${snapshot.stats.extensionCount})`
                });
                return;
            }

            if (exportMode === 'all') {
                await exportNodesAsZip(
                    this.props.vm,
                    snapshot.allFileNodes,
                    `${projectBase}-explorer.zip`,
                    (done, total, name) => {
                        this.setState({statusMessage: `Упаковка ${done}/${total}: ${name}`});
                    }
                );
                this.setState({
                    busy: false,
                    statusMessage: `Экспортировано всё дерево проекта (${snapshot.allFileNodes.length} файлов)`
                });
            }
        } catch (err) {
            this.setState({
                busy: false,
                errorMessage: err.message || String(err)
            });
        }
    };

    render () {
        return (
            <Sb3ExplorerModalComponent
                snapshot={this.state.snapshot}
                currentPath={this.state.currentPath}
                selectedItemPath={this.state.selectedItemPath}
                checkedPaths={this.state.checkedPaths}
                collapsedPaths={this.state.collapsedPaths}
                searchQuery={this.state.searchQuery}
                exportMode={this.state.exportMode}
                spriteExportAsZip={this.state.spriteExportAsZip}
                selectedSpriteIds={this.state.selectedSpriteIds}
                previewUrl={this.state.previewUrl}
                previewText={this.state.previewText}
                busy={this.state.busy}
                statusMessage={this.state.statusMessage}
                errorMessage={this.state.errorMessage}
                onClose={this.props.onClose}
                onRefresh={this.handleRefresh}
                onNavigate={this.handleNavigate}
                onToggleCollapse={this.handleToggleCollapse}
                onExpandAll={this.handleExpandAll}
                onCollapseAll={this.handleCollapseAll}
                onSelectItem={this.handleSelectItem}
                onToggleCheck={this.handleToggleCheck}
                onCheckAllInFolder={this.handleCheckAllInFolder}
                onClearChecks={this.handleClearChecks}
                onSearchChange={searchQuery => this.setState({searchQuery})}
                onExportModeChange={exportMode => this.setState({exportMode, errorMessage: '', statusMessage: ''})}
                onToggleSpriteExportAsZip={() => this.setState(prev => ({spriteExportAsZip: !prev.spriteExportAsZip}))}
                onToggleSpriteId={this.handleToggleSpriteId}
                onDownloadSelectedNode={this.handleDownloadSelectedNode}
                onRunExport={this.handleRunExport}
            />
        );
    }
}

UliSb3ExplorerModal.propTypes = {
    vm: PropTypes.instanceOf(VM).isRequired,
    projectTitle: PropTypes.string,
    onClose: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm,
    projectTitle: state.scratchGui.projectTitle
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeSb3ExplorerModal())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(UliSb3ExplorerModal);
