import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import VM from 'scratch-vm';
import {closeSendScriptModal} from '../reducers/modals';
import {
    getPendingSendScript,
    clearPendingSendScript,
    countBlocksInStack,
    getTargetListForSend,
    sendScriptToTargets
} from '../lib/uli-send-script';
import SendScriptModalComponent from '../components/uli-send-script/send-script-modal.jsx';

class UliSendScriptModal extends React.Component {
    constructor (props) {
        super(props);
        const pending = getPendingSendScript() || {};
        const fromTargetId = pending.sourceTargetId || (props.vm.editingTarget && props.vm.editingTarget.id) || null;
        const fromTarget = fromTargetId && props.vm.runtime ? props.vm.runtime.getTargetById(fromTargetId) : null;

        const blockId = pending.blockId || pending.rootBlockId || null;
        const rootBlockId = pending.rootBlockId || pending.blockId || null;

        const fullBlockCount = fromTarget && rootBlockId ?
            countBlocksInStack(fromTarget.blocks, rootBlockId) :
            0;
        const partialBlockCount = fromTarget && blockId ?
            countBlocksInStack(fromTarget.blocks, blockId) :
            fullBlockCount;

        const targets = getTargetListForSend(props.vm, fromTargetId);

        this.state = {
            fromTargetId,
            blockId,
            rootBlockId,
            fullBlockCount,
            partialBlockCount,
            canChoosePartial: Boolean(blockId && rootBlockId && blockId !== rootBlockId),
            sendFullScript: true,
            targets,
            selectedIds: [],
            searchQuery: '',
            busy: false,
            statusMessage: '',
            errorMessage: ''
        };

        this.handleSearchChange = this.handleSearchChange.bind(this);
        this.handleToggleTarget = this.handleToggleTarget.bind(this);
        this.handleSelectAll = this.handleSelectAll.bind(this);
        this.handleDeselectAll = this.handleDeselectAll.bind(this);
        this.handleChangeScope = this.handleChangeScope.bind(this);
        this.handleSend = this.handleSend.bind(this);
        this.handleClose = this.handleClose.bind(this);
    }

    componentWillUnmount () {
        clearPendingSendScript();
    }

    handleSearchChange (searchQuery) {
        this.setState({searchQuery});
    }

    handleToggleTarget (targetId) {
        this.setState(prev => {
            const exists = prev.selectedIds.indexOf(targetId) !== -1;
            return {
                selectedIds: exists ?
                    prev.selectedIds.filter(id => id !== targetId) :
                    prev.selectedIds.concat(targetId),
                statusMessage: '',
                errorMessage: ''
            };
        });
    }

    handleSelectAll (visibleIds) {
        this.setState(prev => {
            const merged = new Set(prev.selectedIds);
            for (const id of visibleIds) merged.add(id);
            return {
                selectedIds: Array.from(merged),
                statusMessage: '',
                errorMessage: ''
            };
        });
    }

    handleDeselectAll () {
        this.setState({
            selectedIds: [],
            statusMessage: '',
            errorMessage: ''
        });
    }

    handleChangeScope (sendFullScript) {
        this.setState({sendFullScript});
    }

    async handleSend () {
        const {
            fromTargetId,
            blockId,
            rootBlockId,
            sendFullScript,
            selectedIds
        } = this.state;
        if (selectedIds.length === 0) return;

        const isRu = Boolean(this.props.locale && this.props.locale.toLowerCase().startsWith('ru'));
        const startBlockId = sendFullScript ? rootBlockId : blockId;

        this.setState({busy: true, statusMessage: '', errorMessage: ''});
        try {
            const {sentCount} = await sendScriptToTargets({
                vm: this.props.vm,
                fromTargetId,
                startBlockId,
                targetIds: selectedIds,
                workspaceMetrics: this.props.workspaceMetrics,
                isRtl: this.props.isRtl
            });

            const refreshedTargets = getTargetListForSend(this.props.vm, fromTargetId);
            this.setState({
                busy: false,
                targets: refreshedTargets,
                statusMessage: isRu ?
                    `Скрипт отправлен в ${sentCount} спр.` :
                    `Script sent to ${sentCount} target(s).`
            });

            setTimeout(() => {
                this.props.onClose();
            }, 550);
        } catch (err) {
            this.setState({
                busy: false,
                errorMessage: err && err.message ? err.message : (isRu ? 'Не удалось отправить скрипт' : 'Failed to send script')
            });
        }
    }

    handleClose () {
        if (!this.state.busy) {
            this.props.onClose();
        }
    }

    render () {
        const isRu = Boolean(this.props.locale && this.props.locale.toLowerCase().startsWith('ru'));
        return (
            <SendScriptModalComponent
                isRu={isRu}
                targets={this.state.targets}
                selectedIds={this.state.selectedIds}
                searchQuery={this.state.searchQuery}
                canChoosePartial={this.state.canChoosePartial}
                sendFullScript={this.state.sendFullScript}
                fullBlockCount={this.state.fullBlockCount}
                partialBlockCount={this.state.partialBlockCount}
                busy={this.state.busy}
                statusMessage={this.state.statusMessage}
                errorMessage={this.state.errorMessage}
                onSearchChange={this.handleSearchChange}
                onToggleTarget={this.handleToggleTarget}
                onSelectAll={this.handleSelectAll}
                onDeselectAll={this.handleDeselectAll}
                onChangeScope={this.handleChangeScope}
                onSend={this.handleSend}
                onClose={this.handleClose}
            />
        );
    }
}

UliSendScriptModal.propTypes = {
    vm: PropTypes.instanceOf(VM).isRequired,
    locale: PropTypes.string,
    isRtl: PropTypes.bool,
    workspaceMetrics: PropTypes.shape({
        targets: PropTypes.objectOf(PropTypes.object)
    }),
    onClose: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm,
    locale: state.locales.locale,
    isRtl: state.locales.isRtl,
    workspaceMetrics: state.scratchGui.workspaceMetrics
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeSendScriptModal())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(UliSendScriptModal);
