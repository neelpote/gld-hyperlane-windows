// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply test token. Does not represent or redeem physical gold.
contract Gold is ERC20 {
    constructor(address recipient, uint256 supply) ERC20("Gold", "GLD") {
        require(recipient != address(0), "Zero recipient");
        _mint(recipient, supply);
    }
}
