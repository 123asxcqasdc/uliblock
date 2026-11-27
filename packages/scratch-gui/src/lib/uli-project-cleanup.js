import AddonHooks from '../addons/hooks';
import LazyScratchBlocks from './tw-lazy-scratch-blocks';
import UndoGroup from '../addons/addons/editor-devtools/UndoGroup';

const nextTick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

const isBlockDisposed = block => (
    !block ||
    (typeof block.isDisposed === 'function' ? block.isDisposed() : !block.workspace)
);

const getBlockHeightWidthSafe = block => {
    try {
        if (block && typeof block.getHeightWidth === 'function') {
            const hw = block.getHeightWidth();
            return {
                width: Number(hw && hw.width) || 0,
                height: Number(hw && hw.height) || 0
            };
        }
    } catch (_e) {
        // ignore
    }
    return {width: 0, height: 0};
};

const isVmHatBlock = (runtime, vmBlock) => {
    if (!vmBlock) return false;
    if (runtime && typeof runtime.getIsHat === 'function' && runtime.getIsHat(vmBlock.opcode)) {
        return true;
    }
    if (vmBlock.opcode === 'procedures_definition') {
        return true;
    }
    return false;
};

const isBlocklyHatBlock = (runtime, block) => {
    if (!block) return false;
    const opcode = block.type;
    if (runtime && typeof runtime.getIsHat === 'function' && runtime.getIsHat(opcode)) {
        return true;
    }
    if (opcode === 'procedures_definition') {
        return true;
    }
    return (
        block.previousConnection === null &&
        block.outputConnection === null &&
        block.nextConnection !== null
    );
};

const getProcedureDefProcCodeBlockly = defBlock => {
    try {
        if (!defBlock || defBlock.type !== 'procedures_definition') return null;
        const input = defBlock.getInput('custom_block');
        const proto = input && input.connection ? input.connection.targetBlock() : null;
        if (proto && typeof proto.getProcCode === 'function') {
            return proto.getProcCode();
        }
    } catch (_e) {
        // ignore
    }
    return null;
};

const getCalledProcCodesInTargetVm = (target, excludedTopIds) => {
    const called = new Set();
    if (!target || !target.blocks) return called;
    const scriptIds = typeof target.blocks.getScripts === 'function' ? target.blocks.getScripts() : [];
    const visit = blockId => {
        if (!blockId) return;
        const b = target.blocks.getBlock(blockId);
        if (!b) return;
        if (b.opcode === 'procedures_call' && b.mutation && b.mutation.proccode) {
            called.add(b.mutation.proccode);
        }
        if (b.next) visit(b.next);
        const inputs = b.inputs || {};
        for (const key of Object.keys(inputs)) {
            const inp = inputs[key];
            if (inp && inp.block) visit(inp.block);
        }
    };
    for (const scriptId of scriptIds) {
        if (excludedTopIds && excludedTopIds.has(scriptId)) continue;
        visit(scriptId);
    }
    return called;
};

const scanProjectCleanupStats = vm => {
    const stats = {
        targetCount: 0,
        totalScripts: 0,
        hatlessScripts: 0,
        emptyHats: 0,
        orphanedReporters: 0,
        unusedLocalVars: 0,
        unusedLocalLists: 0
    };
    if (!vm || !vm.runtime || !Array.isArray(vm.runtime.targets)) return stats;

    const runtime = vm.runtime;
    const targets = runtime.targets.filter(t => t && t.isOriginal);
    stats.targetCount = targets.length;

    for (const target of targets) {
        if (!target.blocks) continue;
        const scriptIds = typeof target.blocks.getScripts === 'function' ? target.blocks.getScripts() : [];
        stats.totalScripts += scriptIds.length;

        const hatlessIds = new Set();
        for (const id of scriptIds) {
            const b = target.blocks.getBlock(id);
            if (!b) continue;
            if (!isVmHatBlock(runtime, b)) {
                hatlessIds.add(id);
                stats.hatlessScripts++;
            }
        }

        const calledProcCodes = getCalledProcCodesInTargetVm(target, hatlessIds);

        for (const id of scriptIds) {
            const b = target.blocks.getBlock(id);
            if (!b || !isVmHatBlock(runtime, b)) continue;
            if (b.next === null) {
                if (b.opcode === 'procedures_definition') {
                    const customInput = b.inputs && b.inputs.custom_block;
                    const proto = customInput && customInput.block ?
                        target.blocks.getBlock(customInput.block) :
                        null;
                    const procCode = proto && proto.mutation ? proto.mutation.proccode : null;
                    if (!procCode || !calledProcCodes.has(procCode)) {
                        stats.emptyHats++;
                    }
                } else {
                    stats.emptyHats++;
                }
            }
        }

        const allRefs = typeof target.blocks.getAllVariableAndListReferences === 'function' ?
            target.blocks.getAllVariableAndListReferences() :
            {};
        const variables = target.variables || {};
        for (const varId of Object.keys(variables)) {
            const v = variables[varId];
            if (!v || !v.isLocal) continue;
            const refs = allRefs[varId];
            if (!refs || refs.length === 0) {
                if (v.type === 'list') {
                    stats.unusedLocalLists++;
                } else {
                    stats.unusedLocalVars++;
                }
            }
        }
    }

    return stats;
};

const SCRIPTS_PER_COLUMN = 5;
const LONG_HORIZONTAL_WIDTH = 600;
const LONG_INLINE_REPORTERS = 6;

const countMaxInlineReporters = block => {
    if (!block || isBlockDisposed(block)) return 0;

    const countExprReporters = (expr, seenExpr = new Set()) => {
        if (!expr || isBlockDisposed(expr)) return 0;
        const exprKey = expr.id || expr;
        if (seenExpr.has(exprKey)) return 0;
        seenExpr.add(exprKey);

        let total = 1;
        const inputs = Array.isArray(expr.inputList) ? expr.inputList : [];
        for (const input of inputs) {
            const target = input && input.connection && typeof input.connection.targetBlock === 'function' ?
                input.connection.targetBlock() :
                null;
            if (target && !isBlockDisposed(target) && target.outputConnection) {
                total += countExprReporters(target, seenExpr);
            }
        }
        return total;
    };

    let maxInStack = 0;
    const visited = new Set();
    const stack = [block];

    while (stack.length > 0) {
        const cur = stack.pop();
        if (!cur || isBlockDisposed(cur)) continue;
        const key = cur.id || cur;
        if (visited.has(key)) continue;
        visited.add(key);

        try {
            let rowReporters = 0;
            const inputs = Array.isArray(cur.inputList) ? cur.inputList : [];
            for (const input of inputs) {
                const target = input && input.connection && typeof input.connection.targetBlock === 'function' ?
                    input.connection.targetBlock() :
                    null;
                if (!target || isBlockDisposed(target)) continue;
                if (target.outputConnection) {
                    rowReporters += countExprReporters(target);
                } else if (target.previousConnection) {
                    stack.push(target);
                }
            }
            if (rowReporters > maxInStack) {
                maxInStack = rowReporters;
            }

            if (typeof cur.getNextBlock === 'function') {
                const next = cur.getNextBlock();
                if (next && !isBlockDisposed(next)) {
                    stack.push(next);
                }
            }
        } catch (_e) {
            // ignore
        }
    }

    return maxInStack;
};

const getScriptHorizontalMetrics = (block, maxWidths) => {
    const hw = getBlockHeightWidthSafe(block);
    const widthWithComments = Math.max(hw.width, (maxWidths && maxWidths[block.id]) || 0);
    const maxInlineReporters = widthWithComments > 0 ? 0 : countMaxInlineReporters(block);
    return {
        width: widthWithComments,
        height: hw.height,
        maxInlineReporters
    };
};

const isLongHorizontalScript = metrics => (
    metrics.width > 0 ?
        metrics.width >= LONG_HORIZONTAL_WIDTH :
        metrics.maxInlineReporters >= LONG_INLINE_REPORTERS
);

const getOrderedTopBlockColumns = (workspace, {separateOrphans = true, longestRight = true} = {}) => {
    const topBlocks = workspace.getTopBlocks();
    const maxWidths = {};

    if (separateOrphans) {
        const topComments = workspace.getTopComments();
        for (const comment of topComments) {
            if (!comment || isBlockDisposed(comment.block_)) continue;
            if (comment.setVisible) {
                try {
                    comment.setVisible(false);
                    comment.needsAutoPositioning_ = true;
                    comment.setVisible(true);

                    const right = comment.getBoundingRectangle().bottomRight.x;
                    const root = comment.block_.getRootBlock();
                    if (root && !isBlockDisposed(root)) {
                        const left = root.getBoundingRectangle().topLeft.x;
                        maxWidths[root.id] = Math.max(right - left, maxWidths[root.id] || 0);
                    }
                } catch (_e) {
                    // ignore comment layout edge cases
                }
            }
        }
    }

    const orphans = {x: -999999, count: 0, blocks: []};
    const scriptItems = [];

    for (const topBlock of topBlocks) {
        if (isBlockDisposed(topBlock)) continue;
        const xy = topBlock.getRelativeToSurfaceXY();

        if (separateOrphans && topBlock.outputConnection) {
            orphans.blocks.push(topBlock);
            continue;
        }

        const metrics = getScriptHorizontalMetrics(topBlock, maxWidths);
        scriptItems.push({
            block: topBlock,
            xy,
            width: metrics.width,
            height: metrics.height,
            maxInlineReporters: metrics.maxInlineReporters
        });
    }

    const compareByHorizontalWidth = (a, b) => (
        (a.width - b.width) ||
        (a.maxInlineReporters - b.maxInlineReporters) ||
        (a.height - b.height) ||
        (a.xy.y - b.xy.y) ||
        (a.xy.x - b.xy.x)
    );

    const compareByPosition = (a, b) => (
        (a.xy.x - b.xy.x) ||
        (a.xy.y - b.xy.y)
    );

    const cols = [];

    if (longestRight) {
        const normalItems = [];
        const longItems = [];
        for (const item of scriptItems) {
            if (isLongHorizontalScript(item)) {
                longItems.push(item);
            } else {
                normalItems.push(item);
            }
        }

        normalItems.sort(compareByHorizontalWidth);
        longItems.sort(compareByHorizontalWidth);

        for (let i = 0; i < normalItems.length; i += SCRIPTS_PER_COLUMN) {
            const chunk = normalItems.slice(i, i + SCRIPTS_PER_COLUMN);
            cols.push({
                x: cols.length,
                count: chunk.length,
                blocks: chunk.map(item => item.block)
            });
        }

        if (longItems.length > 0) {
            cols.push({
                x: cols.length,
                count: longItems.length,
                blocks: longItems.map(item => item.block)
            });
        }
    } else {
        const sortedItems = scriptItems.slice().sort(compareByPosition);
        for (let i = 0; i < sortedItems.length; i += SCRIPTS_PER_COLUMN) {
            const chunk = sortedItems.slice(i, i + SCRIPTS_PER_COLUMN);
            cols.push({
                x: cols.length,
                count: chunk.length,
                blocks: chunk.map(item => item.block)
            });
        }
    }

    return {cols, orphans, maxWidths};
};

const deleteUnusedLocalsSilently = workspace => {
    const map = workspace.getVariableMap();
    if (!map) return {varsRemoved: 0, listsRemoved: 0};

    let varsRemoved = 0;
    let listsRemoved = 0;

    const vars = map.getVariablesOfType('').slice();
    for (const row of vars) {
        if (row.isLocal) {
            const usages = map.getVariableUsesById(row.getId());
            if (!usages || usages.length === 0) {
                workspace.deleteVariableById(row.getId());
                varsRemoved++;
            }
        }
    }

    const lists = map.getVariablesOfType('list').slice();
    for (const row of lists) {
        if (row.isLocal) {
            const usages = map.getVariableUsesById(row.getId());
            if (!usages || usages.length === 0) {
                workspace.deleteVariableById(row.getId());
                listsRemoved++;
            }
        }
    }

    return {varsRemoved, listsRemoved};
};

const layoutColumnsCleanUpPlus = ({
    workspace,
    makeSpaceForBlock = null,
    removeOrphans = true,
    removeUnusedVarsAndLists = true,
    longestRight = true
}) => {
    const result = getOrderedTopBlockColumns(workspace, {separateOrphans: true, longestRight});
    const columns = result.cols;
    let orphansRemoved = 0;

    if (result.orphans.blocks.length > 0 && !makeSpaceForBlock) {
        if (removeOrphans) {
            for (const orphanBlock of result.orphans.blocks) {
                if (!isBlockDisposed(orphanBlock)) {
                    orphanBlock.dispose(false);
                    orphansRemoved++;
                }
            }
        } else {
            columns.unshift(result.orphans);
        }
    }

    const maxWidths = result.maxWidths;
    let cursorX = 48;

    for (const column of columns) {
        let cursorY = 64;
        let maxWidth = 0;

        for (const block of column.blocks) {
            if (isBlockDisposed(block)) continue;
            const extraWidth = block === makeSpaceForBlock ? 380 : 0;
            const extraHeight = block === makeSpaceForBlock ? 480 : 72;
            const xy = block.getRelativeToSurfaceXY();
            if (cursorX - xy.x !== 0 || cursorY - xy.y !== 0) {
                block.moveBy(cursorX - xy.x, cursorY - xy.y);
            }
            const heightWidth = getBlockHeightWidthSafe(block);
            cursorY += heightWidth.height + extraHeight;

            const maxWidthWithComments = maxWidths[block.id] || 0;
            maxWidth = Math.max(maxWidth, Math.max(heightWidth.width + extraWidth, maxWidthWithComments));
        }

        cursorX += maxWidth + 96;
    }

    const topComments = workspace.getTopComments();
    for (const comment of topComments) {
        if (comment && comment.setVisible) {
            comment.setVisible(false);
            comment.needsAutoPositioning_ = true;
            comment.setVisible(true);
        }
    }

    let varsRemoved = 0;
    let listsRemoved = 0;
    if (removeUnusedVarsAndLists) {
        const localRes = deleteUnusedLocalsSilently(workspace);
        varsRemoved = localRes.varsRemoved;
        listsRemoved = localRes.listsRemoved;
    }

    return {orphansRemoved, varsRemoved, listsRemoved};
};

const cleanCurrentWorkspaceBlocks = ({
    workspace,
    vm,
    removeHatless = true,
    removeEmptyHats = true,
    removeUnusedLocals = true,
    runCleanUpPlus = true,
    longestRight = true
}) => {
    const stats = {
        hatlessRemoved: 0,
        emptyHatsRemoved: 0,
        orphansRemoved: 0,
        varsRemoved: 0,
        listsRemoved: 0
    };
    if (!workspace || !vm || !vm.runtime) return stats;

    const runtime = vm.runtime;
    UndoGroup.startUndoGroup(workspace);

    try {
        const topBlocks = workspace.getTopBlocks().slice();
        const blocksToDelete = [];
        const deleteIdSet = new Set();

        if (removeHatless) {
            for (const topBlock of topBlocks) {
                if (isBlockDisposed(topBlock)) continue;
                if (!isBlocklyHatBlock(runtime, topBlock)) {
                    blocksToDelete.push({block: topBlock, kind: topBlock.outputConnection ? 'orphan' : 'hatless'});
                    deleteIdSet.add(topBlock.id);
                }
            }
        }

        if (removeEmptyHats) {
            const calledProcCodes = new Set();
            for (const topBlock of topBlocks) {
                if (isBlockDisposed(topBlock) || deleteIdSet.has(topBlock.id)) continue;
                const descendants = topBlock.getDescendants(false);
                for (const d of descendants) {
                    if (d.type === 'procedures_call' && typeof d.getProcCode === 'function') {
                        calledProcCodes.add(d.getProcCode());
                    }
                }
            }

            for (const topBlock of topBlocks) {
                if (isBlockDisposed(topBlock) || deleteIdSet.has(topBlock.id)) continue;
                if (!isBlocklyHatBlock(runtime, topBlock)) continue;
                if (topBlock.getNextBlock() === null) {
                    if (topBlock.type === 'procedures_definition') {
                        const procCode = getProcedureDefProcCodeBlockly(topBlock);
                        if (procCode && calledProcCodes.has(procCode)) {
                            continue;
                        }
                    }
                    blocksToDelete.push({block: topBlock, kind: 'emptyHat'});
                    deleteIdSet.add(topBlock.id);
                }
            }
        }

        for (const item of blocksToDelete) {
            if (!isBlockDisposed(item.block)) {
                item.block.dispose(false);
                if (item.kind === 'emptyHat') {
                    stats.emptyHatsRemoved++;
                } else {
                    stats.hatlessRemoved++;
                }
            }
        }

        if (runCleanUpPlus) {
            const cleanRes = layoutColumnsCleanUpPlus({
                workspace,
                makeSpaceForBlock: null,
                removeOrphans: true,
                removeUnusedVarsAndLists: removeUnusedLocals,
                longestRight
            });
            stats.orphansRemoved += cleanRes.orphansRemoved;
            stats.varsRemoved += cleanRes.varsRemoved;
            stats.listsRemoved += cleanRes.listsRemoved;
        } else if (removeUnusedLocals) {
            const localRes = deleteUnusedLocalsSilently(workspace);
            stats.varsRemoved += localRes.varsRemoved;
            stats.listsRemoved += localRes.listsRemoved;
        }
    } finally {
        UndoGroup.endUndoGroup(workspace);
    }

    return stats;
};

const flushBlocklyEvents = ScratchBlocks => {
    try {
        if (
            ScratchBlocks &&
            ScratchBlocks.Events &&
            typeof ScratchBlocks.Events.fireNow_ === 'function' &&
            Array.isArray(ScratchBlocks.Events.FIRE_QUEUE_) &&
            ScratchBlocks.Events.FIRE_QUEUE_.length > 0
        ) {
            ScratchBlocks.Events.fireNow_();
        }
    } catch (_e) {
        // ignore
    }
};

const cleanAllProjectTargets = async ({
    vm,
    activeTabIndex = 0,
    onActivateTab,
    options = {},
    onProgress
}) => {
    const summary = {
        targetsProcessed: 0,
        targetsModified: 0,
        hatlessRemoved: 0,
        emptyHatsRemoved: 0,
        orphansRemoved: 0,
        varsRemoved: 0,
        listsRemoved: 0
    };

    if (!vm || !vm.runtime || !Array.isArray(vm.runtime.targets)) {
        return summary;
    }

    const ScratchBlocks = LazyScratchBlocks.get();
    const originalTargetId = vm.editingTarget ? vm.editingTarget.id : null;
    const switchedTab = activeTabIndex !== 0 && typeof onActivateTab === 'function';

    if (switchedTab) {
        onActivateTab(0);
        await nextFrame();
        await nextTick(60);
    }

    const workspace = AddonHooks.blocklyWorkspace || (ScratchBlocks && ScratchBlocks.getMainWorkspace && ScratchBlocks.getMainWorkspace());
    if (!workspace) {
        if (switchedTab) {
            onActivateTab(activeTabIndex);
        }
        throw new Error('Рабочая область блоков недоступна');
    }

    const targets = vm.runtime.targets.filter(t => t && t.isOriginal);
    const total = targets.length;

    const cleanupOpts = {
        removeHatless: options.removeHatless !== false,
        removeEmptyHats: options.removeEmptyHats !== false,
        removeUnusedLocals: options.removeUnusedLocals !== false,
        runCleanUpPlus: options.runCleanUpPlus !== false,
        longestRight: options.longestRight !== false
    };

    try {
        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            const blockCount = target.blocks && target.blocks._blocks ? Object.keys(target.blocks._blocks).length : 0;
            const varCount = target.variables ? Object.keys(target.variables).length : 0;

            summary.targetsProcessed++;
            if (typeof onProgress === 'function') {
                onProgress({
                    current: i + 1,
                    total,
                    targetName: typeof target.getName === 'function' ? target.getName() : target.id
                });
            }

            if (blockCount === 0 && varCount === 0) {
                continue;
            }

            if (!vm.editingTarget || vm.editingTarget.id !== target.id) {
                vm.setEditingTarget(target.id);
                await nextFrame();
                await nextTick(10);
            }

            const res = cleanCurrentWorkspaceBlocks(Object.assign({workspace, vm}, cleanupOpts));
            flushBlocklyEvents(ScratchBlocks);
            await nextTick(15);

            const targetChanged = (
                res.hatlessRemoved > 0 ||
                res.emptyHatsRemoved > 0 ||
                res.orphansRemoved > 0 ||
                res.varsRemoved > 0 ||
                res.listsRemoved > 0 ||
                (cleanupOpts.runCleanUpPlus && blockCount > 0)
            );
            if (targetChanged) {
                summary.targetsModified++;
            }

            summary.hatlessRemoved += res.hatlessRemoved;
            summary.emptyHatsRemoved += res.emptyHatsRemoved;
            summary.orphansRemoved += res.orphansRemoved;
            summary.varsRemoved += res.varsRemoved;
            summary.listsRemoved += res.listsRemoved;
        }
    } finally {
        if (originalTargetId && vm.runtime.getTargetById(originalTargetId)) {
            vm.setEditingTarget(originalTargetId);
            await nextFrame();
            await nextTick(15);
        }
        if (switchedTab) {
            onActivateTab(activeTabIndex);
        }
        if (typeof vm.emitTargetsUpdate === 'function') {
            vm.emitTargetsUpdate();
        }
        if (typeof vm.refreshWorkspace === 'function') {
            vm.refreshWorkspace();
        }
    }

    return summary;
};

export {
    isVmHatBlock,
    isBlocklyHatBlock,
    scanProjectCleanupStats,
    getOrderedTopBlockColumns,
    deleteUnusedLocalsSilently,
    layoutColumnsCleanUpPlus,
    cleanCurrentWorkspaceBlocks,
    cleanAllProjectTargets
};
